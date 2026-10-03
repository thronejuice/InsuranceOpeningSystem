import { Prisma } from '../../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service.js';
import { REDACTED, redact } from './redact.js';

describe('redact', () => {
  it('masks sensitive keys at any depth and keeps the rest', () => {
    expect(
      redact({
        name: 'ACME',
        passwordHash: 'x',
        contacts: [{ citizenId: '1234567890123', phone: '081' }],
        auth: { refreshToken: 'abc', taxId: '0105' },
      }),
    ).toEqual({
      name: 'ACME',
      passwordHash: REDACTED,
      contacts: [{ citizenId: REDACTED, phone: '081' }],
      auth: { refreshToken: REDACTED, taxId: REDACTED },
    });
  });

  it('serialises Decimal as string and Date as ISO', () => {
    expect(redact({ amount: new Prisma.Decimal('52000.50'), at: new Date('2026-01-01T00:00:00Z') })).toEqual({
      amount: '52000.5',
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps undefined as undefined (column stays NULL)', () => {
    expect(redact(undefined)).toBeUndefined();
  });
});

describe('AuditService', () => {
  it('writes on the current transaction with user/ip/ua from CLS', async () => {
    const create = vi.fn().mockResolvedValue({});
    const store: Record<string, string> = { userId: 'u-1', ip: '10.0.0.1', userAgent: 'vitest' };
    const service = new AuditService(
      { tx: { activityLog: { create } } } as never,
      { get: (key: string) => store[key] } as never,
    );

    await service.log({
      action: 'STATUS_CHANGED',
      entityType: 'job',
      entityId: 'j-1',
      jobId: 'j-1',
      oldValue: { status: 'OPEN' },
      newValue: { status: 'SUBMITTED', token: 'secret' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        action: 'STATUS_CHANGED',
        entityType: 'job',
        entityId: 'j-1',
        jobId: 'j-1',
        oldValue: { status: 'OPEN' },
        newValue: { status: 'SUBMITTED', token: REDACTED },
        description: undefined,
        userId: 'u-1',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      },
    });
  });

  it('explicit userId wins over CLS (e.g. LOGIN before auth context exists)', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new AuditService({ tx: { activityLog: { create } } } as never, { get: () => undefined } as never);

    await service.log({ action: 'LOGIN', entityType: 'user', userId: 'u-9' });

    expect(create.mock.calls[0][0].data.userId).toBe('u-9');
  });
});
