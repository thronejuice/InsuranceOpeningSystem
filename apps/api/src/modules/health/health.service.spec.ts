import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

describe('HealthService', () => {
  it('returns ok when the database responds', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).resolves.toEqual({ status: 'ok', database: 'ok' });
  });

  it('propagates the error when the database is unreachable', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).rejects.toThrow('connection refused');
  });
});
