import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** A failed API call during seeding, carrying enough context to see which scenario step broke. */
export class SeedError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${method} ${path} → ${status} ${JSON.stringify(body)}`);
  }
}

/** A minimal but valid PDF (passes the upload content check) — every seeded document uses it. */
export const SAMPLE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
);

type Json = Record<string, unknown>;

/**
 * One signed-in user. Every call goes through the real HTTP pipeline (guards, validation, workflow, audit),
 * so seeded data is produced by exactly the code paths the application uses.
 */
export class Actor {
  private token = '';

  constructor(
    private readonly app: INestApplication,
    readonly username: string,
    private readonly password: string,
  ) {}

  /** Set after login — the user's id, handy as `agentId`. */
  id = '';

  async login(): Promise<this> {
    const res = await request(this.app.getHttpServer()).post('/api/auth/login').send({ username: this.username, password: this.password });
    if (res.status !== 200) throw new SeedError('POST', `/api/auth/login (${this.username})`, res.status, res.body);
    this.token = res.body.data.accessToken as string;
    const me = await this.get<{ id: string }>('/api/auth/me');
    this.id = me.id;
    return this;
  }

  private async send<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: Json): Promise<T> {
    const call = (): Promise<request.Response> => {
      const req = request(this.app.getHttpServer())[method](path).set('Authorization', `Bearer ${this.token}`);
      return Promise.resolve(body && method !== 'get' ? req.send(body) : req);
    };
    let res = await call();
    if (res.status === 401) {
      await this.login(); // the token expired during a long run
      res = await call();
    }
    if (res.status >= 400) throw new SeedError(method.toUpperCase(), path, res.status, res.body);
    return (res.body?.data ?? res.body) as T;
  }

  get<T = unknown>(path: string) {
    return this.send<T>('get', path);
  }
  post<T = unknown>(path: string, body: Json = {}) {
    return this.send<T>('post', path, body);
  }
  put<T = unknown>(path: string, body: Json = {}) {
    return this.send<T>('put', path, body);
  }
  del<T = unknown>(path: string) {
    return this.send<T>('delete', path);
  }

  async upload<T = unknown>(path: string, fields: Record<string, string>, filename = 'document.pdf'): Promise<T> {
    let req = request(this.app.getHttpServer()).post(path).set('Authorization', `Bearer ${this.token}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const res = await req.attach('file', SAMPLE_PDF, { filename, contentType: 'application/pdf' });
    if (res.status >= 400) throw new SeedError('POST', path, res.status, res.body);
    return (res.body?.data ?? res.body) as T;
  }
}
