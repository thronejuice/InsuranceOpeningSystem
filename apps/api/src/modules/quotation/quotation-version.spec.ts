import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { QuotationService } from './quotation.service.js';

describe('Quotation & QuotationVersion (Phase 2 Day 11)', () => {
  let service: QuotationService;
  let mockTxHost: any;
  let mockDbTx: any;
  let mockRepo: any;
  let mockSequence: any;
  let mockAudit: any;
  let mockCls: any;
  let mockScope: any;
  let mockWorkflow: any;
  let mockNotifications: any;

  const jobId = 'job-1111-1111-1111-111111111111';
  const prodId = 'prod-1111-1111-1111-111111111111';
  const insurerId = 'comp-1111-1111-1111-111111111111';
  const userId = 'user-1111-1111-1111-111111111111';

  let inMemoryQuotations: any[];
  let inMemoryVersions: any[];
  let inMemoryItems: any[];

  beforeEach(() => {
    inMemoryQuotations = [];
    inMemoryVersions = [];
    inMemoryItems = [];

    mockDbTx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: jobId,
          jobNo: 'JOB-2026-0001',
          status: 'OPEN',
          productId: prodId,
          agentId: userId,
          brokerStaffId: 'staff-1',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      insuranceProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: prodId,
          requireUnderwriting: false,
        }),
      },
      insuranceCompany: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.id === insurerId) {
            return { id: insurerId, name: 'Thai Insurance', code: 'INS-TH001' };
          }
          return null;
        }),
      },
      underwriting: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      commissionRate: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.insuranceCompanyId === insurerId && where.productId === prodId) {
            return {
              id: 'cr-1',
              insuranceCompanyId: insurerId,
              productId: prodId,
              rate: { toString: () => '12.0000', toFixed: () => '12.0000' },
              effectiveFrom: new Date('2026-01-01'),
            };
          }
          return null;
        }),
      },
      quotationVersion: {
        create: vi.fn(async ({ data }: any) => {
          const v = {
            id: `qv-${inMemoryVersions.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          inMemoryVersions.push(v);
          return v;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          const matched = inMemoryVersions
            .filter((v) => v.quotationId === where.quotationId)
            .sort((a, b) => b.version - a.version);
          return matched[0] ?? null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const v of inMemoryVersions) {
            if (v.quotationId === where.quotationId && (!where.status || v.status === where.status)) {
              Object.assign(v, data);
              count++;
            }
          }
          return { count };
        }),
      },
      quotationItem: {
        createMany: vi.fn(async ({ data }: any) => {
          inMemoryItems.push(...data);
          return { count: data.length };
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      quotation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockTxHost = { tx: mockDbTx };

    mockRepo = {
      findByJobAndCompany: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (data: any) => {
        const q = {
          id: `quo-${inMemoryQuotations.length + 1}`,
          jobId,
          insuranceCompanyId: data.insuranceCompany.connect.id,
          quotationNo: data.quotationNo,
          quotationDate: data.quotationDate ?? null,
          validUntil: data.validUntil ?? null,
          status: 'REQUESTED',
          grossPremium: { toFixed: () => Number(data.grossPremium).toFixed(2), toString: () => String(data.grossPremium) },
          discount: { toFixed: () => Number(data.discount ?? '0').toFixed(2), toString: () => String(data.discount ?? '0') },
          netPremium: { toFixed: () => Number(data.netPremium).toFixed(2), toString: () => String(data.netPremium) },
          stampDuty: { toFixed: () => Number(data.stampDuty).toFixed(2), toString: () => String(data.stampDuty) },
          tax: { toFixed: () => Number(data.tax).toFixed(2), toString: () => String(data.tax) },
          totalAmount: { toFixed: () => Number(data.totalAmount).toFixed(2), toString: () => String(data.totalAmount) },
          remark: data.remark ?? null,
          version: 1,
          requestedById: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          insuranceCompany: { id: insurerId, name: 'Thai Insurance' },
          versions: data.versions?.create
            ? [
                {
                  id: 'qv-1',
                  version: data.versions.create.version,
                  status: data.versions.create.status,
                  commissionRate: data.versions.create.commissionRate
                    ? { toFixed: () => String(data.versions.create.commissionRate), toString: () => String(data.versions.create.commissionRate) }
                    : null,
                  commissionAmount: data.versions.create.commissionAmount
                    ? { toFixed: () => String(data.versions.create.commissionAmount), toString: () => String(data.versions.create.commissionAmount) }
                    : null,
                  grossPremium: { toFixed: () => Number(data.grossPremium).toFixed(2), toString: () => String(data.grossPremium) },
                  discount: { toFixed: () => Number(data.discount ?? '0').toFixed(2), toString: () => String(data.discount ?? '0') },
                  netPremium: { toFixed: () => Number(data.netPremium).toFixed(2), toString: () => String(data.netPremium) },
                  stampDuty: { toFixed: () => Number(data.stampDuty).toFixed(2), toString: () => String(data.stampDuty) },
                  tax: { toFixed: () => Number(data.tax).toFixed(2), toString: () => String(data.tax) },
                  totalAmount: { toFixed: () => Number(data.totalAmount).toFixed(2), toString: () => String(data.totalAmount) },
                },
              ]
            : [],
        };
        inMemoryQuotations.push(q);
        if (data.versions?.create) {
          inMemoryVersions.push({ quotationId: q.id, ...data.versions.create });
        }
        return q;
      }),
      findById: vi.fn(async (id: string) => {
        const found = inMemoryQuotations.find((q) => q.id === id);
        if (!found) return null;
        return {
          ...found,
          versions: inMemoryVersions.filter((v) => v.quotationId === id),
        };
      }),
      update: vi.fn(async (id: string, data: any) => {
        const found = inMemoryQuotations.find((q) => q.id === id);
        if (!found) throw new Error('Not found');
        if (data.status) found.status = data.status;
        if (data.version) found.version = data.version;
        if (data.grossPremium) {
          found.grossPremium = { toFixed: () => Number(data.grossPremium).toFixed(2), toString: () => String(data.grossPremium) };
        }
        if (data.netPremium) {
          found.netPremium = { toFixed: () => Number(data.netPremium).toFixed(2), toString: () => String(data.netPremium) };
        }
        if (data.totalAmount) {
          found.totalAmount = { toFixed: () => Number(data.totalAmount).toFixed(2), toString: () => String(data.totalAmount) };
        }
        return {
          ...found,
          versions: inMemoryVersions.filter((v) => v.quotationId === id),
        };
      }),
      countRequestedForJob: vi.fn().mockResolvedValue(1),
      countReceivedForJob: vi.fn().mockResolvedValue(1),
    };

    mockSequence = { next: vi.fn().mockResolvedValue('QT-2026-0001') };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockCls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return userId;
        return undefined;
      }),
    };
    mockScope = {
      jobViewScope: vi.fn().mockReturnValue({}),
      canUpdateJob: vi.fn().mockReturnValue(true),
    };
    mockWorkflow = { transitionInTx: vi.fn().mockResolvedValue(undefined) };
    mockNotifications = { emit: vi.fn().mockResolvedValue(undefined) };

    service = new QuotationService(
      mockRepo,
      mockSequence,
      mockAudit,
      mockTxHost,
      mockCls,
      mockScope,
      mockWorkflow,
      mockNotifications,
    );
  });

  describe('Validation Rules (Day 11)', () => {
    it('throws INSURER_REQUIRED (422) when insurerId is missing or empty', async () => {
      await expect(
        service.create(jobId, {
          insuranceCompanyId: '',
          grossPremium: '10000',
        }),
      ).rejects.toMatchObject({
        code: 'INSURER_REQUIRED',
        status: 422,
      });
    });

    it('throws COMPANY_NOT_FOUND (404) when insurer does not exist', async () => {
      await expect(
        service.create(jobId, {
          insuranceCompanyId: 'unknown-company-id',
          grossPremium: '10000',
        }),
      ).rejects.toMatchObject({
        code: 'COMPANY_NOT_FOUND',
        status: 404,
      });
    });

    it('throws INVALID_DATE_RANGE (422) when validUntil is earlier than quotationDate', async () => {
      await expect(
        service.create(jobId, {
          insuranceCompanyId: insurerId,
          quotationDate: '2026-06-30',
          validUntil: '2026-06-01',
          grossPremium: '10000',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
        status: 422,
      });
    });

    it('throws PREMIUM_NEGATIVE (422) when grossPremium is negative', async () => {
      await expect(
        service.create(jobId, {
          insuranceCompanyId: insurerId,
          grossPremium: '-500',
        }),
      ).rejects.toMatchObject({
        code: 'PREMIUM_NEGATIVE',
        status: 422,
      });
    });

    it('throws PREMIUM_NEGATIVE (422) when discount exceeds grossPremium (net negative)', async () => {
      await expect(
        service.create(jobId, {
          insuranceCompanyId: insurerId,
          grossPremium: '1000',
          discount: '1500',
        }),
      ).rejects.toMatchObject({
        code: 'PREMIUM_NEGATIVE',
        status: 422,
      });
    });
  });

  describe('Commission Rate Defaulting (Day 11)', () => {
    it('defaults commissionRate from master commission_rates by quotationDate and calculates commissionAmount', async () => {
      const res = await service.create(jobId, {
        insuranceCompanyId: insurerId,
        quotationDate: '2026-03-01',
        validUntil: '2026-04-01',
        grossPremium: '10000',
        discount: '0',
      });

      // Net is 10000. Master rate is 12.0000%.
      // Commission amount = 10000 * 12% = 1200.00
      expect(mockDbTx.commissionRate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            insuranceCompanyId: insurerId,
            productId: prodId,
          }),
        }),
      );
      expect(res.commissionRate).toBe('12.0000');
      expect(res.commissionAmount).toBe('1200.00');
    });

    it('uses user-specified commissionRate when provided instead of master default', async () => {
      const res = await service.create(jobId, {
        insuranceCompanyId: insurerId,
        quotationDate: '2026-03-01',
        validUntil: '2026-04-01',
        grossPremium: '10000',
        discount: '0',
        commissionRate: '15.5000',
      });

      // Net is 10000. Rate is 15.5000%. Commission = 1550.00
      expect(res.commissionRate).toBe('15.5000');
      expect(res.commissionAmount).toBe('1550.00');
    });
  });

  describe('QuotationVersion & Superseding (V2 §9.1)', () => {
    it('creates initial version 1 on create, and supersedes version 1 when recording version 2', async () => {
      // 1. Initial create -> version 1, ACTIVE
      const q1 = await service.create(jobId, {
        insuranceCompanyId: insurerId,
        quotationDate: '2026-03-01',
        validUntil: '2026-04-01',
        grossPremium: '10000',
      });

      expect(q1.version).toBe(1);
      expect(inMemoryVersions[0].version).toBe(1);
      expect(inMemoryVersions[0].status).toBe('ACTIVE');

      // 2. Record new version (e.g. insurer negotiated a lower rate)
      const q2 = await service.recordReceived(q1.id, {
        grossPremium: '9000',
        discount: '0',
        quotationDate: '2026-03-05',
        validUntil: '2026-04-05',
        remark: 'Negotiated discount version 2',
      });

      expect(q2.version).toBe(2);
      expect(mockDbTx.quotationVersion.updateMany).toHaveBeenCalledWith({
        where: { quotationId: q1.id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });

      // v1 is now SUPERSEDED
      expect(inMemoryVersions[0].status).toBe('SUPERSEDED');

      // v2 is ACTIVE
      const v2 = inMemoryVersions.find((v) => v.version === 2);
      expect(v2).toBeDefined();
      expect(v2.status).toBe('ACTIVE');
      expect(v2.grossPremium).toBe('9000');
    });

    it('select marks active version status as SELECTED', async () => {
      const q1 = await service.create(jobId, {
        insuranceCompanyId: insurerId,
        quotationDate: '2026-03-01',
        validUntil: '2030-01-01',
        grossPremium: '10000',
      });

      await service.recordReceived(q1.id, {
        grossPremium: '10000',
      });

      await service.select(q1.id, { version: 2 });

      expect(mockDbTx.quotationVersion.updateMany).toHaveBeenCalledWith({
        where: { quotationId: q1.id, status: 'ACTIVE' },
        data: { status: 'SELECTED' },
      });
    });
  });
});

