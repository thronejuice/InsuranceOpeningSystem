import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { QuotationService } from './quotation.service.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';
import { NotificationType } from '../../generated/prisma/enums.js';

describe('Quotation Actions V2 & Expiry (Phase 2 Day 12)', () => {
  const userId = 'user-agent-1111-1111-111111111111';
  const staffId = 'user-staff-2222-2222-222222222222';
  const jobId = 'job-1111-1111-1111-111111111111';
  const insurerA = 'comp-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const insurerB = 'comp-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let service: QuotationService;
  let jobWorkflow: JobWorkflowService;
  let mockRepo: any;
  let mockSequence: any;
  let mockAudit: any;
  let mockNotifications: any;
  let mockWorkflow: any;
  let mockTxHost: any;
  let inMemoryQuotations: any[];
  let inMemoryVersions: any[];
  let inMemoryItems: any[];
  let inMemoryJob: any;

  beforeEach(() => {
    inMemoryQuotations = [];
    inMemoryVersions = [];
    inMemoryItems = [];

    inMemoryJob = {
      id: jobId,
      jobNo: 'JOB-2026-0001',
      status: 'QUOTATION_RECEIVED',
      version: 1,
      productId: 'prod-1',
      agentId: userId,
      brokerStaffId: staffId,
      selectedQuotationId: null,
    };

    const mockDbTx: any = {
      job: {
        findFirst: vi.fn(async () => inMemoryJob),
        update: vi.fn(async ({ data }: any) => {
          Object.assign(inMemoryJob, data);
          return inMemoryJob;
        }),
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(inMemoryJob, data);
          return { count: 1 };
        }),
      },
      insuranceProduct: {
        findFirst: vi.fn(async () => ({ requireUnderwriting: false })),
      },
      insuranceCompany: {
        findFirst: vi.fn(async ({ where }: any) => ({
          id: where.id,
          name: where.id === insurerA ? 'Company A' : 'Company B',
        })),
      },
      commissionRate: {
        findFirst: vi.fn(async () => ({ rate: '15.00' })),
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
            .filter((v) => v.quotationId === where.quotationId && (!where.status || v.status === where.status))
            .sort((a, b) => b.version - a.version);
          return matched[0] ?? null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const v of inMemoryVersions) {
            const matchesQuote = where.quotationId?.in
              ? where.quotationId.in.includes(v.quotationId)
              : where.quotationId === v.quotationId;
            const matchesStatus = !where.status || v.status === where.status;
            if (matchesQuote && matchesStatus) {
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
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const q of inMemoryQuotations) {
            const matchesId = where.id?.in ? where.id.in.includes(q.id) : where.id === q.id;
            const matchesStatus = !where.status || q.status === where.status;
            if (matchesId && matchesStatus) {
              Object.assign(q, data);
              count++;
            }
          }
          return { count };
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return inMemoryQuotations.filter((q) => {
            if (where.jobId && q.jobId !== where.jobId) return false;
            if (where.status?.notIn && where.status.notIn.includes(q.status)) return false;
            return true;
          });
        }),
      },
      jobStatusHistory: {
        create: vi.fn().mockResolvedValue({}),
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
          status: 'RECEIVED',
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
          insuranceCompany: { id: data.insuranceCompany.connect.id, name: 'Insurance Company' },
          versions: data.versions?.create
            ? [
                {
                  id: 'qv-1',
                  version: data.versions.create.version,
                  status: data.versions.create.status,
                  quotationDate: data.versions.create.quotationDate ?? null,
                  validUntil: data.versions.create.validUntil ?? null,
                  grossPremium: data.grossPremium,
                  discount: data.discount ?? '0',
                  netPremium: data.netPremium,
                  stampDuty: data.stampDuty,
                  tax: data.tax,
                  totalAmount: data.totalAmount,
                  commissionRate: data.versions.create.commissionRate,
                  commissionAmount: data.versions.create.commissionAmount,
                  items: [],
                },
              ]
            : [],
        };
        inMemoryQuotations.push(q);
        if (data.versions?.create) {
          inMemoryVersions.push({ quotationId: q.id, ...data.versions.create, id: 'qv-1' });
        }
        return q;
      }),
      findById: vi.fn(async (id: string) => {
        const found = inMemoryQuotations.find((q) => q.id === id);
        if (!found) return null;
        return {
          ...found,
          versions: inMemoryVersions
            .filter((v) => v.quotationId === id)
            .sort((a, b) => b.version - a.version)
            .map((v) => ({
              ...v,
              items: inMemoryItems.filter(
                (i) => i.quotationVersionId === v.id || (!i.quotationVersionId && i.quotationId === id),
              ),
            })),
        };
      }),
      update: vi.fn(async (id: string, data: any) => {
        const found = inMemoryQuotations.find((q) => q.id === id);
        if (found) {
          Object.assign(found, data);
        }
        return {
          ...found,
          versions: inMemoryVersions
            .filter((v) => v.quotationId === id)
            .sort((a, b) => b.version - a.version)
            .map((v) => ({
              ...v,
              items: inMemoryItems.filter(
                (i) => i.quotationVersionId === v.id || (!i.quotationVersionId && i.quotationId === id),
              ),
            })),
        };
      }),
      findAllByJob: vi.fn(async (jId: string) => {
        return inMemoryQuotations
          .filter((q) => q.jobId === jId)
          .map((q) => ({
            ...q,
            versions: inMemoryVersions
              .filter((v) => v.quotationId === q.id)
              .sort((a, b) => b.version - a.version)
              .map((v) => ({
                ...v,
                items: inMemoryItems.filter(
                  (i) => i.quotationVersionId === v.id || (!i.quotationVersionId && i.quotationId === q.id),
                ),
              })),
          }));
      }),
      findOutdated: vi.fn(async (cutoff: Date) => {
        return inMemoryQuotations.filter((q) => {
          if (!['REQUESTED', 'RECEIVED'].includes(q.status)) return false;
          if (!q.validUntil) return false;
          return new Date(q.validUntil).getTime() < cutoff.getTime();
        });
      }),
      findExpiring: vi.fn(async (from: Date, to: Date) => {
        return inMemoryQuotations
          .filter((q) => {
            if (!['REQUESTED', 'RECEIVED'].includes(q.status)) return false;
            if (!q.validUntil) return false;
            const t = new Date(q.validUntil).getTime();
            return t >= from.getTime() && t <= to.getTime();
          })
          .map((q) => ({
            ...q,
            job: inMemoryJob,
          }));
      }),
      countReceivedForJob: vi.fn().mockResolvedValue(1),
    };

    mockSequence = {
      next: vi.fn().mockResolvedValue('QT-2026-0001'),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    mockWorkflow = {
      transitionInTx: vi.fn(async (j: any, to: string) => {
        j.status = to;
      }),
    };

    const cls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return userId;
        return undefined;
      }),
    };

    const scope = {
      jobViewScope: vi.fn().mockReturnValue({}),
    };

    service = new QuotationService(
      mockRepo,
      mockSequence,
      mockAudit,
      mockTxHost,
      cls as any,
      scope as any,
      mockWorkflow,
      mockNotifications,
    );

    jobWorkflow = new JobWorkflowService(
      mockTxHost,
      {
        findById: vi.fn(async () => inMemoryJob),
        update: vi.fn(async (_id: string, data: any) => Object.assign(inMemoryJob, data)),
      } as any,
      mockAudit,
      cls as any,
      mockNotifications,
    );
  });

  describe('recordVersion & Superseding', () => {
    it('creates version 2 and marks version 1 as SUPERSEDED', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2026-12-31',
        grossPremium: '10000',
      });

      expect(inMemoryVersions).toHaveLength(1);
      expect(inMemoryVersions[0].version).toBe(1);
      expect(inMemoryVersions[0].status).toBe('ACTIVE');

      const v2Response = await service.recordReceived(q.id, {
        grossPremium: '9500',
        remark: 'Negotiated lower premium for v2',
      });

      expect(inMemoryVersions).toHaveLength(2);
      const v1 = inMemoryVersions.find((v) => v.version === 1);
      const v2 = inMemoryVersions.find((v) => v.version === 2);
      expect(v1.status).toBe('SUPERSEDED');
      expect(v2.status).toBe('ACTIVE');
      expect(v2Response.grossPremium).toBe('9500.00');
    });

    it('throws error when attempting to record version on a WITHDRAWN quotation', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2026-12-31',
        grossPremium: '10000',
      });

      await service.withdraw(q.id, { reason: 'No longer offered' });

      await expect(
        service.recordReceived(q.id, {
          grossPremium: '9500',
        }),
      ).rejects.toMatchObject({
        code: 'QUOTATION_INVALID_STATUS',
        status: 409,
      });
    });
  });

  describe('withdraw action', () => {
    it('marks quotation and active version as WITHDRAWN and records audit log', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2026-12-31',
        grossPremium: '10000',
      });

      const withdrawn = await service.withdraw(q.id, { reason: 'Insurer recalled quote' });
      expect(withdrawn.status).toBe('WITHDRAWN');

      const qv = inMemoryVersions.find((v) => v.quotationId === q.id);
      expect(qv.status).toBe('WITHDRAWN');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUOTATION_WITHDRAWN',
          entityType: 'QUOTATION',
          entityId: q.id,
          description: 'Insurer recalled quote',
        }),
      );
    });

    it('throws 422 QUOTATION_CANNOT_WITHDRAW_SELECTED when quotation is already SELECTED', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2030-12-31',
        grossPremium: '10000',
      });

      await service.select(q.id, { version: 1, reason: 'Best coverage' });

      await expect(
        service.withdraw(q.id, { reason: 'Customer changed mind' }),
      ).rejects.toMatchObject({
        code: 'QUOTATION_CANNOT_WITHDRAW_SELECTED',
        status: 422,
      });
    });
  });

  describe('select action & validations', () => {
    it('succeeds when selecting the latest active version', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2030-12-31',
        grossPremium: '10000',
      });

      await service.recordReceived(q.id, {
        grossPremium: '9000',
      });

      const selected = await service.select(q.id, { version: 2, reason: 'Selected v2' });
      expect(selected.status).toBe('SELECTED');
      expect(inMemoryJob.selectedQuotationId).toBe(q.id);
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.anything(),
        'QUOTATION_SELECTED',
        userId,
      );
    });

    it('throws 422 OLD_VERSION_CANNOT_BE_SELECTED when trying to select version 1 after version 2 was recorded', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2030-12-31',
        grossPremium: '10000',
      });

      await service.recordReceived(q.id, {
        grossPremium: '9000',
      });

      // Trying to select old version 1 -> 422 OLD_VERSION_CANNOT_BE_SELECTED
      await expect(
        service.select(q.id, { version: 1, reason: 'Select v1' }),
      ).rejects.toMatchObject({
        code: 'OLD_VERSION_CANNOT_BE_SELECTED',
        status: 422,
      });
    });

    it('throws 422 QUOTATION_EXPIRED when selecting an expired quotation', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2020-01-01',
        validUntil: '2020-02-01', // Expired
        grossPremium: '10000',
      });

      await expect(
        service.select(q.id, { version: 1, reason: 'Select expired' }),
      ).rejects.toMatchObject({
        code: 'QUOTATION_EXPIRED',
        status: 422,
      });
    });

    it('throws 422 QUOTATION_WITHDRAWN when selecting a withdrawn quotation', async () => {
      const q = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2030-12-31',
        grossPremium: '10000',
      });

      await service.withdraw(q.id);

      await expect(
        service.select(q.id, { version: 1, reason: 'Select withdrawn' }),
      ).rejects.toMatchObject({
        code: 'QUOTATION_WITHDRAWN',
        status: 422,
      });
    });
  });

  describe('Daily Expiry & Expiring Notifications', () => {
    it('expireOutdatedQuotations marks expired quotations and their active versions as EXPIRED', async () => {
      const qPast = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-01-01',
        validUntil: '2026-01-10',
        grossPremium: '10000',
      });

      const qFuture = await service.create(jobId, {
        insuranceCompanyId: insurerB,
        quotationDate: '2026-01-01',
        validUntil: '2030-12-31',
        grossPremium: '12000',
      });

      const result = await service.expireOutdatedQuotations(new Date('2026-02-01'));
      expect(result.count).toBe(1);

      const refreshedPast = inMemoryQuotations.find((q) => q.id === qPast.id);
      expect(refreshedPast.status).toBe('EXPIRED');
      const refreshedFuture = inMemoryQuotations.find((q) => q.id === qFuture.id);
      expect(refreshedFuture.status).toBe('RECEIVED');
    });

    it('notifyExpiringQuotations emits QUOTATION_EXPIRING for quotes expiring within 3 days', async () => {
      await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-10-01',
        validUntil: '2026-10-10', // within 3 days of 2026-10-08
        grossPremium: '10000',
      });

      const result = await service.notifyExpiringQuotations(new Date('2026-10-08T00:00:00+07:00'));
      expect(result.count).toBe(1);
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        NotificationType.QUOTATION_EXPIRING,
        expect.arrayContaining([userId, staffId]),
        expect.objectContaining({
          entityType: 'QUOTATION',
          jobId,
        }),
      );
    });
  });

  describe('D-5: Job CLOSED / POLICY_ISSUED Rejection Rule', () => {
    it('marks unselected quotations and their active versions as REJECTED when Job transitions to CLOSED', async () => {
      const q1 = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        grossPremium: '10000',
      });
      const q2 = await service.create(jobId, {
        insuranceCompanyId: insurerB,
        grossPremium: '12000',
      });

      expect(inMemoryQuotations.find((q) => q.id === q1.id).status).toBe('RECEIVED');
      expect(inMemoryQuotations.find((q) => q.id === q2.id).status).toBe('RECEIVED');

      inMemoryJob.status = 'OPEN';
      await jobWorkflow.transitionInTx(inMemoryJob, 'CLOSED', userId, { reason: 'Customer cancelled project' });

      expect(inMemoryQuotations.find((q) => q.id === q1.id).status).toBe('REJECTED');
      expect(inMemoryQuotations.find((q) => q.id === q2.id).status).toBe('REJECTED');
      expect(inMemoryVersions.every((v) => v.status === 'REJECTED')).toBe(true);
    });
  });

  describe('Comparison API', () => {
    it('returns comparison data with latest version details across multiple quotations', async () => {
      const qA = await service.create(jobId, {
        insuranceCompanyId: insurerA,
        quotationDate: '2026-03-01',
        validUntil: '2026-04-01',
        grossPremium: '10000',
      });

      const qB = await service.create(jobId, {
        insuranceCompanyId: insurerB,
        quotationDate: '2026-03-01',
        validUntil: '2026-04-01',
        grossPremium: '15000',
      });

      // Record v2 for qA with lower premium
      await service.recordReceived(qA.id, {
        grossPremium: '8000',
        deductible: '5000',
        commissionRate: '18.00',
        exclusion: 'Flooding excluded',
        specialCondition: 'Install CCTV',
        items: [
          {
            coverageName: 'Fire Protection',
            sumInsured: '1000000',
            premium: '4000',
          },
        ],
      });

      const comparison = await service.comparison(jobId);
      expect(comparison.jobId).toBe(jobId);
      expect(comparison.companies).toHaveLength(2);

      const colA = comparison.companies.find((c) => c.quotationId === qA.id);
      expect(colA).toBeDefined();
      expect(colA?.version).toBe(2);
      expect(colA?.grossPremium).toBe('8000.00');
      expect(colA?.deductible).toBe('5000.00');
      expect(colA?.commissionRate).toBe('18.0000');
      expect(colA?.exclusion).toBe('Flooding excluded');
      expect(colA?.specialCondition).toBe('Install CCTV');
      expect(colA?.isLowest).toBe(true); // 8000 < 15000

      const colB = comparison.companies.find((c) => c.quotationId === qB.id);
      expect(colB?.version).toBe(1);
      expect(colB?.isLowest).toBe(false);

      expect(comparison.coverages).toHaveLength(1);
      expect(comparison.coverages[0].coverageName).toBe('Fire Protection');
      expect(comparison.coverages[0].cells[0].sumInsured).toBe('1000000.00');
    });
  });
});
