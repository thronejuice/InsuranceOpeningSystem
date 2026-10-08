import { Prisma } from '../../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service.js';
import { REDACTED, redact } from './redact.js';
import { ActivitySource } from '../../generated/prisma/enums.js';

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
  it('writes on the current transaction with user/ip/ua from CLS and default WEB source', async () => {
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
        source: ActivitySource.WEB,
        remark: undefined,
        description: undefined,
        userId: 'u-1',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      },
    });
  });

  it('supports custom source and remark', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new AuditService(
      { tx: { activityLog: { create } } } as never,
      { get: () => 'u-1' } as never,
    );

    await service.log({
      action: 'IMPORT_CUSTOMERS',
      entityType: 'CUSTOMER',
      source: ActivitySource.IMPORT,
      remark: 'Batch import from file.xlsx',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'IMPORT_CUSTOMERS',
          entityType: 'CUSTOMER',
          source: ActivitySource.IMPORT,
          remark: 'Batch import from file.xlsx',
        }),
      }),
    );
  });

  it('computes before and after diff automatically when before/after are passed', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new AuditService(
      { tx: { activityLog: { create } } } as never,
      { get: () => 'u-1' } as never,
    );

    const before = {
      grossPremium: '100000',
      discount: '0',
      totalAmount: '107000',
      updatedAt: new Date('2026-01-01'),
    };
    const after = {
      grossPremium: '95000',
      discount: '0',
      totalAmount: '101650',
      updatedAt: new Date('2026-01-02'),
    };

    await service.log({
      action: 'UPDATE_QUOTATION',
      entityType: 'QUOTATION',
      entityId: 'q-1',
      before,
      after,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_QUOTATION',
        entityType: 'QUOTATION',
        entityId: 'q-1',
        oldValue: { grossPremium: '100000', totalAmount: '107000' },
        newValue: { grossPremium: '95000', totalAmount: '101650' },
      }),
    });
  });

  it('explicit userId wins over CLS (e.g. LOGIN before auth context exists)', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new AuditService({ tx: { activityLog: { create } } } as never, { get: () => undefined } as never);

    await service.log({ action: 'LOGIN', entityType: 'user', userId: 'u-9' });

    expect(create.mock.calls[0][0].data.userId).toBe('u-9');
  });

  it('findLogs queries activity logs with filters and pagination', async () => {
    const mockLogs = [
      {
        id: 'log-1',
        action: 'UPDATE_QUOTATION',
        entityType: 'QUOTATION',
        entityId: 'q-1',
        jobId: 'j-1',
        oldValue: { grossPremium: '100000' },
        newValue: { grossPremium: '95000' },
        source: ActivitySource.WEB,
        remark: 'Negotiated discount',
        description: null,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date('2026-10-08T10:00:00Z'),
        user: { id: 'u-1', username: 'staff01', fullName: 'Staff One' },
      },
    ];

    const findMany = vi.fn().mockResolvedValue(mockLogs);
    const count = vi.fn().mockResolvedValue(1);

    const service = new AuditService(
      { tx: { activityLog: { findMany, count } } } as never,
      { get: () => 'u-1' } as never,
    );

    const result = await service.findLogs({
      userId: 'u-1',
      entityType: 'QUOTATION',
      action: 'UPDATE_QUOTATION',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-10-31T23:59:59Z',
      page: 1,
      perPage: 20,
      skip: 0,
      take: 20,
    } as never);

    expect(findMany).toHaveBeenCalled();
    expect(count).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe('UPDATE_QUOTATION');
    expect(result.items[0].source).toBe(ActivitySource.WEB);
    expect(result.items[0].remark).toBe('Negotiated discount');
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });
});
