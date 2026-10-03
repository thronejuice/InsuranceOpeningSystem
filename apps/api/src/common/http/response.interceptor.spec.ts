import { StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Paginated } from './pagination.dto.js';
import { ResponseInterceptor } from './response.interceptor.js';

const run = (body: unknown) =>
  firstValueFrom(new ResponseInterceptor().intercept({} as never, { handle: () => of(body) }));

describe('ResponseInterceptor', () => {
  it('wraps a single result', async () => {
    await expect(run({ id: '1' })).resolves.toEqual({ success: true, data: { id: '1' }, message: 'Success' });
  });

  it('wraps a void result as data: null', async () => {
    await expect(run(undefined)).resolves.toEqual({ success: true, data: null, message: 'Success' });
  });

  it('unwraps Paginated into data + meta', async () => {
    const page = Paginated.of([{ id: '1' }], 41, { page: 2, perPage: 20 });

    await expect(run(page)).resolves.toEqual({
      success: true,
      data: [{ id: '1' }],
      meta: { page: 2, perPage: 20, total: 41, lastPage: 3 },
    });
  });

  it('passes files through untouched', async () => {
    const file = new StreamableFile(Buffer.from('x'));

    await expect(run(file)).resolves.toBe(file);
  });
});
