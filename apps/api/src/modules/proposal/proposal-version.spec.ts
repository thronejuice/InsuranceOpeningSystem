import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { ProposalService } from './proposal.service.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';

describe('Proposal Version, Payment Term, Revise & Expiry (Phase 2 Day 13)', () => {
  const userId = 'user-agent-1111-1111-111111111111';
  const customerId = 'cust-1111-1111-1111-111111111111';
  const jobId = 'job-1111-1111-1111-111111111111';
  const quotationId = 'quot-1111-1111-1111-111111111111';
  const qv1Id = 'qv-1111-1111-1111-111111111111';
  const qv2Id = 'qv-2222-2222-2222-222222222222';
  const paymentTermId = 'pt-1111-1111-1111-111111111111';

  let proposalService: ProposalService;
  let jobWorkflow: JobWorkflowService;
  let mockRepo: any;
  let mockJobRepo: any;
  let mockSequence: any;
  let mockAudit: any;
  let mockNotifications: any;
  let mockDocument: any;
  let mockScope: any;
  let mockCls: any;
  let mockTxHost: any;

  let inMemoryJob: any;
  let inMemoryProposals: any[];
  let inMemoryQuotations: any[];
  let inMemoryQuotationVersions: any[];
  let inMemoryApprovals: any[];
  let inMemoryPaymentTerms: any[];
  let inMemoryJobHistory: any[];

  beforeEach(() => {
    inMemoryJob = {
      id: jobId,
      jobNo: 'JOB-2026-0001',
      status: 'QUOTATION_SELECTED',
      version: 1,
      productId: 'prod-1',
      customerId,
      agentId: userId,
      brokerStaffId: null,
      selectedQuotationId: quotationId,
      effectiveDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-01-01'),
      customer: { name: 'Test Customer', customerCode: 'CUS-001' },
      insuranceType: { code: 'MOTOR', name: 'Motor Insurance' },
      product: { code: 'MOTOR-001', name: 'Motor Class 1' },
      agent: { fullName: 'Test Agent' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    inMemoryQuotationVersions = [
      {
        id: qv1Id,
        quotationId,
        version: 1,
        status: 'SELECTED',
        validUntil: new Date('2026-12-31'),
      },
    ];

    inMemoryQuotations = [
      {
        id: quotationId,
        quotationNo: 'QT-2026-0001',
        jobId,
        status: 'SELECTED',
        grossPremium: '10000',
        netPremium: '9500',
        discount: '500',
        versions: inMemoryQuotationVersions,
      },
    ];

    inMemoryPaymentTerms = [
      {
        id: paymentTermId,
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
        active: true,
      },
    ];

    inMemoryProposals = [];
    inMemoryApprovals = [];
    inMemoryJobHistory = [];

    const mockDbTx: any = {
      job: {
        findFirst: vi.fn(async () => inMemoryJob),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where?.id === inMemoryJob.id) {
            Object.assign(inMemoryJob, data);
            if (data.version?.increment) {
              inMemoryJob.version += data.version.increment;
            }
            if ('selectedQuotationId' in data) {
              inMemoryJob.selectedQuotationId = data.selectedQuotationId;
            }
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      jobStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          inMemoryJobHistory.push(data);
          return data;
        }),
      },
      quotation: {
        findFirst: vi.fn(async ({ where }: any) => {
          const q = inMemoryQuotations.find((item) => item.id === where?.id);
          if (!q) return null;
          return {
            ...q,
            versions: inMemoryQuotationVersions.filter((v) => v.quotationId === q.id),
          };
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const q of inMemoryQuotations) {
            if (where?.jobId && q.jobId !== where.jobId) continue;
            if (where?.status && q.status !== where.status) continue;
            Object.assign(q, data);
            count++;
          }
          return { count };
        }),
      },
      quotationVersion: {
        findFirst: vi.fn(async ({ where }: any) => {
          return inMemoryQuotationVersions.find((v) => {
            if (where?.id && v.id !== where.id) return false;
            if (where?.quotationId && v.quotationId !== where.quotationId) return false;
            return true;
          }) ?? null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const v of inMemoryQuotationVersions) {
            if (where?.quotation?.jobId) {
              const q = inMemoryQuotations.find((quo) => quo.id === v.quotationId);
              if (!q || q.jobId !== where.quotation.jobId) continue;
            }
            if (where?.status && v.status !== where.status) continue;
            Object.assign(v, data);
            count++;
          }
          return { count };
        }),
      },
      paymentTerm: {
        findFirst: vi.fn(async ({ where }: any) => {
          return inMemoryPaymentTerms.find((pt) => {
            if (where?.id && pt.id !== where.id) return false;
            if (where?.active !== undefined && pt.active !== where.active) return false;
            return true;
          }) ?? null;
        }),
      },
      proposal: {
        findMany: vi.fn(async ({ where }: any) => {
          return inMemoryProposals.filter((p) => {
            if (where?.jobId && p.jobId !== where.jobId) return false;
            return true;
          });
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return inMemoryProposals.find((p) => p.id === where?.id) ?? null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const p of inMemoryProposals) {
            if (where?.jobId && p.jobId !== where.jobId) continue;
            if (where?.id?.in && !where.id.in.includes(p.id)) continue;
            if (where?.status?.in && !where.status.in.includes(p.status)) continue;
            Object.assign(p, data);
            count++;
          }
          return { count };
        }),
      },
      approval: {
        findMany: vi.fn(async () => inMemoryApprovals),
        create: vi.fn(async ({ data }: any) => {
          const app = {
            id: `app-${inMemoryApprovals.length + 1}`,
            status: 'PENDING',
            ...data,
          };
          inMemoryApprovals.push(app);
          return app;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const a of inMemoryApprovals) {
            if (where?.jobId && a.jobId !== where.jobId) continue;
            if (where?.status && a.status !== where.status) continue;
            Object.assign(a, data);
            count++;
          }
          return { count };
        }),
      },
      approvalRule: {
        findMany: vi.fn(async () => []),
      },
      user: {
        findMany: vi.fn(async () => []),
      },
      insuranceProduct: {
        findFirst: vi.fn(async () => ({ requireUnderwriting: false })),
      },
    };

    mockTxHost = { tx: mockDbTx };

    mockRepo = {
      findByJob: vi.fn(async (jobId: string) => {
        return inMemoryProposals
          .filter((p) => p.jobId === jobId)
          .sort((a, b) => b.version - a.version);
      }),
      findById: vi.fn(async (id: string) => {
        return inMemoryProposals.find((p) => p.id === id) ?? null;
      }),
      findMaxVersionByJob: vi.fn(async (jobId: string) => {
        const matching = inMemoryProposals.filter((p) => p.jobId === jobId);
        if (matching.length === 0) return null;
        const max = Math.max(...matching.map((p) => p.version));
        return { version: max };
      }),
      findLatestByJob: vi.fn(async (jobId: string) => {
        const matching = inMemoryProposals
          .filter((p) => p.jobId === jobId)
          .sort((a, b) => b.version - a.version);
        return matching[0] ?? null;
      }),
      findOutdated: vi.fn(async (date: Date) => {
        return inMemoryProposals.filter((p) => {
          if (!['DRAFT', 'SENT', 'VIEWED'].includes(p.status)) return false;
          return p.validUntil && new Date(p.validUntil) < date;
        });
      }),
      create: vi.fn(async (data: any) => {
        const id = `prop-${inMemoryProposals.length + 1}`;
        const record = {
          id,
          proposalNo: data.proposalNo,
          jobId: data.job.connect.id,
          quotationId: data.quotation.connect.id,
          quotationVersionId: data.quotationVersion?.connect?.id ?? null,
          paymentTermId: data.paymentTerm?.connect?.id ?? null,
          customerId: data.customer.connect.id,
          proposalDate: data.proposalDate ?? null,
          validUntil: data.validUntil ?? null,
          status: 'DRAFT',
          sentAt: null,
          acceptedAt: null,
          rejectedAt: null,
          rejectReason: null,
          coverageSummary: data.coverageSummary ?? null,
          terms: data.terms ?? null,
          conditions: data.conditions ?? null,
          remark: data.remark ?? null,
          version: data.version ?? 1,
          paymentTerm: inMemoryPaymentTerms.find((pt) => pt.id === data.paymentTerm?.connect?.id) ?? null,
          approvals: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inMemoryProposals.push(record);
        return record;
      }),
      update: vi.fn(async (id: string, data: any) => {
        const found = inMemoryProposals.find((p) => p.id === id);
        if (found) {
          Object.assign(found, data);
          found.updatedAt = new Date();
        }
        return found;
      }),
    };

    mockJobRepo = {
      findById: vi.fn(async () => inMemoryJob),
    };

    mockSequence = {
      next: vi.fn(async (prefix: string) => `${prefix}-2026-${String(inMemoryProposals.length + 1).padStart(6, '0')}`),
    };

    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockNotifications = { emit: vi.fn().mockResolvedValue(undefined) };
    mockDocument = {
      renderFinal: vi.fn().mockResolvedValue(Buffer.from('mock pdf')),
      storeFinal: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue({ buffer: Buffer.from('mock pdf'), fileName: 'test.pdf' }),
    };

    mockScope = {
      jobViewScope: vi.fn(() => ({})),
      canUpdateJob: vi.fn(() => true),
    };

    mockCls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return userId;
        if (key === 'permissions') return ['proposal.create', 'proposal.send', 'proposal.accept', 'proposal.reject', 'job.update'];
        return undefined;
      }),
    };

    jobWorkflow = new JobWorkflowService(
      mockTxHost,
      mockJobRepo,
      mockAudit,
      mockScope,
      mockCls,
      { checkRiskComplete: vi.fn().mockResolvedValue([]) } as any,
      { checkDocumentsComplete: vi.fn().mockResolvedValue([]) } as any,
      { createAutoTask: vi.fn().mockResolvedValue(undefined) } as any,
    );

    proposalService = new ProposalService(
      mockRepo,
      mockSequence,
      mockAudit,
      mockTxHost,
      mockCls,
      jobWorkflow,
      mockDocument,
      mockScope,
      mockNotifications,
    );
  });

  describe('Create Proposal with Version, QuotationVersion & PaymentTerm', () => {
    it('creates Proposal v1 referencing quotationVersionId and paymentTermId', async () => {
      const res = await proposalService.create(jobId, {
        proposalDate: '2026-02-01',
        validUntil: '2026-03-01',
        quotationVersionId: qv1Id,
        paymentTermId,
        coverageSummary: 'ความคุ้มครองหลัก 1,000,000 บาท',
        terms: 'ชำระภายในกำหนด',
        conditions: 'เงื่อนไขพิเศษตามระบุ',
      });

      expect(res.version).toBe(1);
      expect(res.status).toBe('DRAFT');
      expect(res.quotationVersionId).toBe(qv1Id);
      expect(res.paymentTermId).toBe(paymentTermId);
      expect(res.coverageSummary).toBe('ความคุ้มครองหลัก 1,000,000 บาท');
      expect(res.terms).toBe('ชำระภายในกำหนด');
      expect(res.conditions).toBe('เงื่อนไขพิเศษตามระบุ');
      expect(res.paymentTerm?.name).toBe('ผ่อน 3 งวด');
    });

    it('throws 422 INVALID_DATE_RANGE when validUntil <= proposalDate', async () => {
      await expect(
        proposalService.create(jobId, {
          proposalDate: '2026-03-01',
          validUntil: '2026-02-01',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
        status: 422,
      });
    });

    it('throws 404 PAYMENT_TERM_NOT_FOUND when paymentTermId is invalid', async () => {
      await expect(
        proposalService.create(jobId, {
          paymentTermId: 'pt-nonexistent',
        }),
      ).rejects.toMatchObject({
        code: 'PAYMENT_TERM_NOT_FOUND',
        status: 404,
      });
    });

    it('throws 404 QUOTATION_VERSION_NOT_FOUND when quotationVersionId does not match selected quotation', async () => {
      await expect(
        proposalService.create(jobId, {
          quotationVersionId: 'qv-other-quotaion',
        }),
      ).rejects.toMatchObject({
        code: 'QUOTATION_VERSION_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('Send Proposal', () => {
    it('sends proposal, sets status to SENT, keeps version 1, and transitions Job to WAITING_CUSTOMER', async () => {
      const created = await proposalService.create(jobId, {
        proposalDate: '2026-02-01',
        validUntil: '2026-03-01',
        paymentTermId,
      });

      const sent = await proposalService.send(created.id);
      expect(sent.status).toBe('SENT');
      expect(sent.version).toBe(1); // Document version remains 1
      expect(sent.sentAt).not.toBeNull();
      expect(inMemoryJob.status).toBe('WAITING_CUSTOMER');
    });
  });

  describe('Daily Task: Expiration of Outdated Proposals', () => {
    it('marks proposals past validUntil as EXPIRED while Job remains WAITING_CUSTOMER', async () => {
      // Proposal 1: expired
      const pExpired = await proposalService.create(jobId, {
        proposalDate: '2026-01-01',
        validUntil: '2026-01-15',
      });
      // Proposal 2: still valid
      const pValid = await proposalService.create(jobId, {
        proposalDate: '2026-01-01',
        validUntil: '2026-12-31',
      });

      inMemoryProposals.find((p) => p.id === pExpired.id)!.status = 'SENT';
      inMemoryProposals.find((p) => p.id === pValid.id)!.status = 'SENT';
      inMemoryJob.status = 'WAITING_CUSTOMER';

      const result = await proposalService.processDaily(new Date('2026-02-01'));
      expect(result.expiredCount).toBe(1);

      const updatedExpired = inMemoryProposals.find((p) => p.id === pExpired.id);
      expect(updatedExpired.status).toBe('EXPIRED');

      const updatedValid = inMemoryProposals.find((p) => p.id === pValid.id);
      expect(updatedValid.status).toBe('SENT');

      // Job remains WAITING_CUSTOMER per PLAN_V2 Day 13
      expect(inMemoryJob.status).toBe('WAITING_CUSTOMER');
    });
  });

  describe('Revise Action & Full Workflow: Send v1 → Revise → Quotation v2 → Select → Send Proposal v2', () => {
    it('revises job, cancels pending approvals, supersedes proposal v1, resets selected quotation to RECEIVED, and allows creating proposal v2', async () => {
      // Step 1: Create Proposal v1
      const p1 = await proposalService.create(jobId, {
        proposalDate: '2026-01-01',
        validUntil: '2026-02-01',
        quotationVersionId: qv1Id,
        paymentTermId,
      });
      expect(p1.version).toBe(1);

      // Step 2: Send Proposal v1 → Job becomes WAITING_CUSTOMER
      await proposalService.send(p1.id);
      expect(inMemoryJob.status).toBe('WAITING_CUSTOMER');

      // Create a pending approval to test cancellation on revise
      inMemoryApprovals.push({
        id: 'app-pending-1',
        jobId,
        proposalId: p1.id,
        status: 'PENDING',
      });

      // Step 3: Customer requests revisions → Trigger revise action
      const reviseRes = await proposalService.revise(p1.id, { reason: 'Customer requested 10% discount and revised terms' });
      expect(reviseRes.status).toBe('SUPERSEDED');

      // Verify side effects of revise:
      // a) Job transitions to QUOTATION_RECEIVED
      expect(inMemoryJob.status).toBe('QUOTATION_RECEIVED');
      expect(inMemoryJob.selectedQuotationId).toBeNull();

      // b) Proposal v1 status is SUPERSEDED
      const p1Record = inMemoryProposals.find((p) => p.id === p1.id);
      expect(p1Record.status).toBe('SUPERSEDED');

      // c) Pending Approval is CANCELLED
      const appRecord = inMemoryApprovals.find((a) => a.id === 'app-pending-1');
      expect(appRecord.status).toBe('CANCELLED');

      // d) Quotation status reverts to RECEIVED and version status to ACTIVE
      const quoRecord = inMemoryQuotations.find((q) => q.id === quotationId);
      expect(quoRecord.status).toBe('RECEIVED');
      const qv1Record = inMemoryQuotationVersions.find((v) => v.id === qv1Id);
      expect(qv1Record.status).toBe('ACTIVE');

      // Step 4: Insurer provides new quotation version (v2) with discount
      inMemoryQuotationVersions.push({
        id: qv2Id,
        quotationId,
        version: 2,
        status: 'ACTIVE',
        validUntil: new Date('2026-12-31'),
      });
      qv1Record.status = 'SUPERSEDED'; // Old version superseded

      // Step 5: User selects Quotation v2
      quoRecord.status = 'SELECTED';
      inMemoryQuotationVersions.find((v) => v.id === qv2Id)!.status = 'SELECTED';
      inMemoryJob.status = 'QUOTATION_SELECTED';
      inMemoryJob.selectedQuotationId = quotationId;

      // Step 6: Create Proposal v2
      const p2 = await proposalService.create(jobId, {
        proposalDate: '2026-02-10',
        validUntil: '2026-03-10',
        quotationVersionId: qv2Id,
        paymentTermId,
        coverageSummary: 'ฉบับปรับปรุงตามคำขอลูกค้า',
      });

      // Version per Job must be 2!
      expect(p2.version).toBe(2);
      expect(p2.quotationVersionId).toBe(qv2Id);
      expect(p2.status).toBe('DRAFT');

      // Step 7: Send Proposal v2
      const p2Sent = await proposalService.send(p2.id);
      expect(p2Sent.status).toBe('SENT');
      expect(p2Sent.version).toBe(2);
      expect(inMemoryJob.status).toBe('WAITING_CUSTOMER');

      // In history/store: Proposal v1 remains SUPERSEDED, Proposal v2 is SENT!
      expect(p1Record.status).toBe('SUPERSEDED');
      expect(p1Record.version).toBe(1);
    });

    it('rejects revise if Job is not in WAITING_CUSTOMER or APPROVAL_REJECTED', async () => {
      inMemoryJob.status = 'OPEN';
      await expect(
        jobWorkflow.revise(jobId, { reason: 'Invalid' }),
      ).rejects.toMatchObject({
        code: 'JOB_INVALID_STATUS',
        status: 409,
      });
    });

    it('allows revise when Job is in APPROVAL_REJECTED', async () => {
      inMemoryJob.status = 'APPROVAL_REJECTED';
      const p1 = await mockRepo.create({
        proposalNo: 'PP-2026-000001',
        job: { connect: { id: jobId } },
        quotation: { connect: { id: quotationId } },
        customer: { connect: { id: customerId } },
        version: 1,
      });
      p1.status = 'SENT';

      const res = await jobWorkflow.revise(jobId, { reason: 'Revise after approval rejected' });
      expect(res.status).toBe('QUOTATION_RECEIVED');
      expect(p1.status).toBe('SUPERSEDED');
    });
  });
});
