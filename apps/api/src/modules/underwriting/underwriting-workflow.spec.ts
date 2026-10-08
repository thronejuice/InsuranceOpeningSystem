import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { UnderwritingStatus } from '../../generated/prisma/enums.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';
import { UnderwritingService } from './underwriting.service.js';
import { QuotationService } from '../quotation/quotation.service.js';

describe('Underwriting & Quotation Workflow (Day 8 e2e/integration)', () => {
  const agentId = 'agent-1111-1111-1111-111111111111';
  const underwriterId = 'underwriter-2222-2222-2222-222222222222';
  const brokerStaffId = 'broker-staff-3333-3333-333333333333';
  const jobId = 'job-1111-1111-1111-111111111111';
  const prodId = 'prod-1111-1111-1111-111111111111';

  // In-memory state tracking to simulate DB transactions accurately
  let dbState: {
    job: {
      id: string;
      jobNo: string;
      status: string;
      version: number;
      agentId: string;
      brokerStaffId: string;
      productId: string;
      product: { id: string; code: string; name: string; requireUnderwriting: boolean };
    };
    underwritings: Array<{
      id: string;
      jobId: string;
      version: number;
      status: UnderwritingStatus;
      riskLevel?: string | null;
      riskScore?: number | null;
      reason?: string | null;
      condition?: string | null;
      exclusion?: string | null;
      deductible?: string | null;
      requiredSurvey?: boolean;
      requiredDocuments?: any;
      requestedById?: string | null;
      underwriterId?: string | null;
      requestedAt: Date;
      reviewedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
      deletedAt?: Date | null;
    }>;
    statusHistory: Array<{
      jobId: string;
      fromStatus: string;
      toStatus: string;
      reason?: string;
      changedById: string;
    }>;
    quotations: any[];
  };

  let mockAudit: any;
  let mockNotifSvc: any;
  let mockDocSvc: any;
  let currentUserId: string;

  let jobWorkflow: JobWorkflowService;
  let underwritingSvc: UnderwritingService;
  let quotationSvc: QuotationService;

  beforeEach(() => {
    currentUserId = agentId;

    dbState = {
      job: {
        id: jobId,
        jobNo: 'JOB-2026-0001',
        status: 'OPEN',
        version: 1,
        agentId,
        brokerStaffId,
        productId: prodId,
        product: {
          id: prodId,
          code: 'MOTOR_COMM',
          name: 'Commercial Motor',
          requireUnderwriting: true,
        },
      },
      underwritings: [],
      statusHistory: [],
      quotations: [],
    };

    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockNotifSvc = { emit: vi.fn().mockResolvedValue(undefined) };
    mockDocSvc = { checkDocumentsComplete: vi.fn().mockResolvedValue([]) };

    const mockCls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return currentUserId;
        if (key === 'permissions') return ['job.view', 'job.update', 'underwriting.review', 'quotation.create'];
        return undefined;
      }),
    };

    const mockScope = {
      jobViewScope: vi.fn().mockReturnValue({}),
      canUpdateJob: vi.fn().mockReturnValue(true),
      assertJobAccess: vi.fn().mockResolvedValue(undefined),
    };

    // Fake Prisma TX / Client
    const mockDbTx = {
      job: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.id === jobId && !where.deletedAt) {
            return dbState.job;
          }
          return null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where.id === dbState.job.id && where.version === dbState.job.version) {
            dbState.job.status = data.status;
            dbState.job.version += 1;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      jobStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          dbState.statusHistory.push(data);
          return { id: `hist-${dbState.statusHistory.length}`, ...data };
        }),
      },
      underwriting: {
        findFirst: vi.fn(async ({ where }: any) => {
          const matched = dbState.underwritings
            .filter((u) => u.jobId === where.jobId && !u.deletedAt)
            .sort((a, b) => b.version - a.version);
          return matched[0] ?? null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return dbState.underwritings.filter((u) => u.jobId === where.jobId && !u.deletedAt);
        }),
        create: vi.fn(async ({ data }: any) => {
          const record = {
            id: `uw-${dbState.underwritings.length + 1}`,
            jobId: data.job.connect.id,
            version: data.version,
            status: data.status,
            requestedById: data.requestedBy?.connect?.id ?? null,
            underwriterId: null,
            reason: data.reason ?? null,
            riskLevel: null,
            riskScore: null,
            condition: null,
            exclusion: null,
            deductible: null,
            requiredSurvey: false,
            requiredDocuments: null,
            requestedAt: new Date(),
            reviewedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          dbState.underwritings.push(record);
          return record;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = dbState.underwritings.find((u) => u.id === where.id);
          if (!item) throw new Error('Not found');
          if (data.status) item.status = data.status;
          if (data.underwriter?.connect?.id) item.underwriterId = data.underwriter.connect.id;
          if (data.underwriter?.disconnect) item.underwriterId = null;
          if (data.reviewedAt !== undefined) item.reviewedAt = data.reviewedAt;
          if (data.reason !== undefined) item.reason = data.reason;
          if (data.condition !== undefined) item.condition = data.condition;
          if (data.exclusion !== undefined) item.exclusion = data.exclusion;
          if (data.deductible !== undefined) item.deductible = data.deductible;
          if (data.riskLevel !== undefined) item.riskLevel = data.riskLevel;
          if (data.riskScore !== undefined) item.riskScore = data.riskScore;
          return item;
        }),
      },
      insuranceProduct: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.id === prodId) return dbState.job.product;
          return null;
        }),
      },
      quotation: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          const q = { id: `quot-${dbState.quotations.length + 1}`, ...data };
          dbState.quotations.push(q);
          return q;
        }),
      },
    };

    const mockTxHost = { tx: mockDbTx };

    // Underwriting repository
    const mockUwRepo = {
      findLatestByJobId: vi.fn(async (jId: string) => {
        const matched = dbState.underwritings
          .filter((u) => u.jobId === jId && !u.deletedAt)
          .sort((a, b) => b.version - a.version);
        return matched[0] ?? null;
      }),
      findByJobId: vi.fn(async (jId: string) => {
        return dbState.underwritings.filter((u) => u.jobId === jId && !u.deletedAt);
      }),
      create: vi.fn(async (data: any) => mockDbTx.underwriting.create({ data })),
      update: vi.fn(async (id: string, data: any) => mockDbTx.underwriting.update({ where: { id }, data })),
      findPendingInbox: vi.fn(async () => {
        return dbState.underwritings.filter((u) => u.status === UnderwritingStatus.PENDING);
      }),
    };

    const mockJobRepo = {
      findById: vi.fn(async (id: string) => (id === jobId ? dbState.job : null)),
      update: vi.fn(async (id: string, data: any) => {
        if (id === jobId) Object.assign(dbState.job, data);
        return dbState.job;
      }),
    };

    const mockQuotationRepo = {
      findAllByJob: vi.fn(async () => dbState.quotations),
      findByJobAndCompany: vi.fn(async () => null),
      create: vi.fn(async (data: any) => mockDbTx.quotation.create({ data })),
    };

    const mockSequence = {
      next: vi.fn().mockResolvedValue('QT-2026-0001'),
    };

    jobWorkflow = new JobWorkflowService(
      mockTxHost as any,
      mockJobRepo as any,
      mockAudit,
      mockCls as any,
      mockScope as any,
    );

    underwritingSvc = new UnderwritingService(
      mockTxHost as any,
      mockUwRepo as any,
      mockScope as any,
      mockAudit,
      mockCls as any,
      mockDocSvc as any,
      jobWorkflow,
      mockNotifSvc,
    );

    quotationSvc = new QuotationService(
      mockQuotationRepo as any,
      mockSequence as any,
      mockAudit,
      mockTxHost as any,
      mockCls as any,
      mockScope as any,
      jobWorkflow,
      mockNotifSvc,
    );
  });

  describe('Full Underwriting Workflow Life-cycle', () => {
    it('enforces underwriting requirement when product requires it: block → info required → resume → approve → quotation succeeds', async () => {
      // 1. Initial State: Job is OPEN, product.requireUnderwriting is true
      expect(dbState.job.status).toBe('OPEN');
      expect(dbState.job.product.requireUnderwriting).toBe(true);

      // 2. Request Quotation / Transition to QUOTATION_REQUESTED before Underwriting Approval -> 422 UNDERWRITING_REQUIRED
      await expect(
        jobWorkflow.transitionInTx(dbState.job, 'QUOTATION_REQUESTED', agentId),
      ).rejects.toMatchObject({
        code: 'UNDERWRITING_REQUIRED',
        status: 422,
      });

      // Also QuotationService.create blocks with 422 UNDERWRITING_REQUIRED
      await expect(
        quotationSvc.create(jobId, {
          insuranceCompanyId: 'comp-1111-1111-1111-111111111111',
          grossPremium: '10000',
        }),
      ).rejects.toMatchObject({
        code: 'UNDERWRITING_REQUIRED',
        status: 422,
      });

      // 3. Agent requests underwriting review
      currentUserId = agentId;
      const requested = await underwritingSvc.requestReview(jobId, { reason: 'Initial submission' });
      expect(requested.status).toBe(UnderwritingStatus.PENDING);
      expect(requested.version).toBe(1);
      expect(dbState.underwritings[0].status).toBe(UnderwritingStatus.PENDING);

      // 4. Maker-Checker Rule: Agent cannot approve/review own request -> 422 MAKER_CHECKER_VIOLATION
      await expect(
        underwritingSvc.review(jobId, {
          status: UnderwritingStatus.APPROVED,
          riskLevel: 'LOW',
        }),
      ).rejects.toMatchObject({
        code: 'MAKER_CHECKER_VIOLATION',
        status: 422,
      });

      // 5. Underwriter requests more information (INFO_REQUIRED)
      currentUserId = underwriterId;
      const infoReq = await underwritingSvc.review(jobId, {
        status: UnderwritingStatus.INFO_REQUIRED,
        reason: 'Please provide clear photos of chassis number and odometer',
        condition: 'Survey required if photos unclear',
      });
      expect(infoReq.status).toBe(UnderwritingStatus.INFO_REQUIRED);

      // Job transitions to WAITING_INFORMATION
      expect(dbState.job.status).toBe('WAITING_INFORMATION');
      expect(mockNotifSvc.emit).toHaveBeenCalledWith(
        'UNDERWRITING_INFO_REQUIRED',
        expect.arrayContaining([agentId, brokerStaffId]),
        expect.objectContaining({
          title: expect.stringContaining('ต้องการข้อมูลเพิ่มเติม'),
        }),
      );

      // In WAITING_INFORMATION, transitioning directly to QUOTATION_REQUESTED is invalid
      await expect(
        jobWorkflow.transitionInTx(dbState.job, 'QUOTATION_REQUESTED', agentId),
      ).rejects.toMatchObject({
        code: 'JOB_INVALID_TRANSITION',
        status: 409,
      });

      // 6. Agent resumes the underwriting review
      currentUserId = agentId;
      const resumed = await underwritingSvc.resume(jobId, 'Photos uploaded and verified');
      expect(resumed.status).toBe(UnderwritingStatus.PENDING);

      // Job transitions back to OPEN
      expect(dbState.job.status).toBe('OPEN');
      expect(dbState.underwritings[0].status).toBe(UnderwritingStatus.PENDING);

      // 7. Underwriter approves review
      currentUserId = underwriterId;
      const approved = await underwritingSvc.review(jobId, {
        status: UnderwritingStatus.APPROVED,
        riskLevel: 'LOW',
        riskScore: 1.5,
        reason: 'All documentation verified and low risk profile',
        deductible: 2000,
      });
      expect(approved.status).toBe(UnderwritingStatus.APPROVED);
      expect(approved.riskLevel).toBe('LOW');

      // Job remains OPEN
      expect(dbState.job.status).toBe('OPEN');
      expect(mockNotifSvc.emit).toHaveBeenCalledWith(
        'UNDERWRITING_APPROVED',
        expect.arrayContaining([agentId, brokerStaffId]),
        expect.objectContaining({
          title: expect.stringContaining('ผ่านการพิจารณา Underwriting เรียบร้อยแล้ว'),
        }),
      );

      // 8. Now transition to QUOTATION_REQUESTED succeeds!
      await expect(
        jobWorkflow.transitionInTx(dbState.job, 'QUOTATION_REQUESTED', agentId),
      ).resolves.toBeUndefined();
      expect(dbState.job.status).toBe('QUOTATION_REQUESTED');
    });

    it('rejects underwriting: underwriter rejects with reason → Job transitions to CLOSED', async () => {
      // 1. Agent requests review
      currentUserId = agentId;
      await underwritingSvc.requestReview(jobId, { reason: 'Commercial fleet vehicle' });
      expect(dbState.underwritings[0].status).toBe(UnderwritingStatus.PENDING);

      // 2. Underwriter rejects review without reason → REASON_REQUIRED (422)
      currentUserId = underwriterId;
      await expect(
        underwritingSvc.review(jobId, {
          status: UnderwritingStatus.REJECTED,
          reason: '',
        }),
      ).rejects.toMatchObject({
        code: 'REASON_REQUIRED',
        status: 422,
      });

      // 3. Underwriter rejects review with valid reason
      const rejected = await underwritingSvc.review(jobId, {
        status: UnderwritingStatus.REJECTED,
        reason: 'Vehicle has high hazard modification not acceptable under underwriting policy',
      });
      expect(rejected.status).toBe(UnderwritingStatus.REJECTED);

      // Job transitions directly to CLOSED
      expect(dbState.job.status).toBe('CLOSED');
      expect(mockNotifSvc.emit).toHaveBeenCalledWith(
        'UNDERWRITING_REJECTED',
        expect.arrayContaining([agentId, brokerStaffId]),
        expect.objectContaining({
          title: expect.stringContaining('ถูกปฏิเสธ'),
        }),
      );

      // Transitioning from CLOSED to QUOTATION_REQUESTED is invalid
      await expect(
        jobWorkflow.transitionInTx(dbState.job, 'QUOTATION_REQUESTED', agentId),
      ).rejects.toMatchObject({
        code: 'JOB_INVALID_TRANSITION',
        status: 409,
      });
    });

    it('bypasses underwriting requirement when product does not require underwriting', async () => {
      // Product requireUnderwriting = false
      dbState.job.product.requireUnderwriting = false;

      // Transitioning directly to QUOTATION_REQUESTED succeeds without any underwriting
      await expect(
        jobWorkflow.transitionInTx(dbState.job, 'QUOTATION_REQUESTED', agentId),
      ).resolves.toBeUndefined();
      expect(dbState.job.status).toBe('QUOTATION_REQUESTED');
    });
  });
});
