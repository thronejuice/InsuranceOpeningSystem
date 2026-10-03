import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { SequenceService } from '../src/common/sequence/sequence.service.js';
import type { INestApplication } from '@nestjs/common';

describe('SequenceService (e2e, real Postgres)', () => {
  let app: INestApplication;
  let sequence: SequenceService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    sequence = app.get(SequenceService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.documentSequence.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('50 concurrent requests get 50 distinct, gap-free numbers', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const numbers = await Promise.all(Array.from({ length: 50 }, () => sequence.next('JOB', now)));

    expect(new Set(numbers).size).toBe(50);
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 50 }, (_, i) => `JOB-2026-${String(i + 1).padStart(6, '0')}`),
    );
  });

  it('counters are independent per prefix and per year', async () => {
    await sequence.next('JOB', new Date('2026-06-01T00:00:00Z'));

    await expect(sequence.next('JOB', new Date('2027-06-01T00:00:00Z'))).resolves.toBe('JOB-2027-000001');
    await expect(sequence.next('QUOTATION', new Date('2026-06-01T00:00:00Z'))).resolves.toBe('QT-2026-000001');
    await expect(sequence.next('CUSTOMER')).resolves.toBe('CUS-000001');
  });
});
