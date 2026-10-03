import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { RequirePermissions } from '../src/common/auth/auth.decorators.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';

/** Test-only routes: nothing in the app requires a permission yet on Day 3 */
@Controller('e2e-probe')
class ProbeController {
  @RequirePermissions('customer.view')
  @Get('customers')
  customers() {
    return { ok: true };
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }
}

const PASSWORD = 'E2e@Password1';
const PREFIX = 'e2e_auth_';

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh_token cookie not set');
  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let sessionUserId: string;

  const http = () => request(app.getHttpServer());
  const login = (username: string, password = PASSWORD) =>
    http().post('/api/auth/login').send({ username, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: PREFIX.toUpperCase() } } });

    const permission = await prisma.permission.upsert({
      where: { code: 'job.view' },
      update: {},
      create: { code: 'job.view' },
    });
    const role = await prisma.role.create({
      data: { code: `${PREFIX.toUpperCase()}AGENT`, name: 'E2E agent', permissions: { create: { permissionId: permission.id } } },
    });
    const passwordHash = await hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        username: `${PREFIX}agent`,
        email: `${PREFIX}agent@example.test`,
        fullName: 'E2E Agent',
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    userId = user.id;
    // Separate user for session/guard tests: the login throttle counts successful attempts too
    const sessionUser = await prisma.user.create({
      data: {
        username: `${PREFIX}session`,
        email: `${PREFIX}session@example.test`,
        fullName: 'E2E Session',
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    sessionUserId = sessionUser.id;
    await prisma.user.create({
      data: { username: `${PREFIX}disabled`, email: `${PREFIX}disabled@example.test`, fullName: 'Disabled', passwordHash, isActive: false },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('200 with access token, user profile and a hardened refresh cookie', async () => {
      const res = await login(`${PREFIX}agent`).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: { id: userId, username: `${PREFIX}agent`, roles: [`${PREFIX.toUpperCase()}AGENT`], permissions: ['job.view'] },
      });
      expect(res.body.data).not.toHaveProperty('refreshToken');

      const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('refresh_token='))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/auth/);

      const log = await prisma.activityLog.findFirst({ where: { userId, action: 'LOGIN' }, orderBy: { createdAt: 'desc' } });
      expect(log).not.toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).lastLoginAt).not.toBeNull();
    });

    it('401 on wrong password and records LOGIN_FAILED', async () => {
      const before = await prisma.activityLog.count({ where: { userId, action: 'LOGIN_FAILED' } });
      const res = await login(`${PREFIX}agent`, 'wrong-password').expect(401);
      expect(res.body).toEqual({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
      expect(await prisma.activityLog.count({ where: { userId, action: 'LOGIN_FAILED' } })).toBe(before + 1);
    });

    it('401 with the same message for an unknown username', async () => {
      const res = await login(`${PREFIX}nobody`).expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('401 ACCOUNT_DISABLED for an inactive user', async () => {
      const res = await login(`${PREFIX}disabled`).expect(401);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('422 when the body is invalid', async () => {
      const res = await http().post('/api/auth/login').send({ username: '' }).expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('429 after 5 attempts per minute for the same IP + username', async () => {
      const username = `${PREFIX}ratelimit`;
      for (let i = 0; i < 5; i++) await login(username, 'wrong').expect(401);
      const res = await login(username, 'wrong').expect(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
      // Other usernames from the same IP are not locked out
      await login(`${PREFIX}agent`).expect(200);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates the token; reusing the old one fails and revokes every session', async () => {
      const first = refreshCookie(await login(`${PREFIX}session`).expect(200));

      const refreshed = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
      const second = refreshCookie(refreshed);
      expect(second).not.toBe(first);

      const reuse = await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
      expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');
      expect(await prisma.activityLog.count({ where: { userId: sessionUserId, action: 'REFRESH_TOKEN_REUSED' } })).toBe(1);

      // Reuse detection also killed the token that was legitimately issued by the rotation
      await http().post('/api/auth/refresh').set('Cookie', second).expect(401);
    });

    it('401 without a cookie or with a garbage token', async () => {
      await http().post('/api/auth/refresh').expect(401);
      await http().post('/api/auth/refresh').set('Cookie', 'refresh_token=garbage').expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the refresh token, clears the cookie and records LOGOUT', async () => {
      const cookie = refreshCookie(await login(`${PREFIX}session`).expect(200));
      const before = await prisma.activityLog.count({ where: { userId: sessionUserId, action: 'LOGOUT' } });

      const res = await http().post('/api/auth/logout').set('Cookie', cookie).expect(200);
      expect(([] as string[]).concat(res.headers['set-cookie']).join()).toMatch(/refresh_token=;/);
      expect(await prisma.activityLog.count({ where: { userId: sessionUserId, action: 'LOGOUT' } })).toBe(before + 1);

      await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });

  describe('guards', () => {
    let accessToken: string;

    beforeAll(async () => {
      accessToken = (await login(`${PREFIX}session`).expect(200)).body.data.accessToken;
    });

    it('GET /api/auth/me returns the current user', async () => {
      const res = await http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(res.body.data).toMatchObject({ id: sessionUserId, email: `${PREFIX}session@example.test`, permissions: ['job.view'] });
    });

    it('401 when there is no token or it is invalid', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      await http().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
      await http().get('/api/e2e-probe/customers').expect(401);
    });

    it('403 when the user lacks the permission', async () => {
      const res = await http().get('/api/e2e-probe/customers').set('Authorization', `Bearer ${accessToken}`).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('403 for a route that declares neither @Public nor @RequirePermissions', async () => {
      await http().get('/api/e2e-probe/undeclared').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });

    it('health stays public', async () => {
      await http().get('/api/health').expect(200);
    });
  });
});
