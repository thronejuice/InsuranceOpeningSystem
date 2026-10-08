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
import { NotificationType } from '../../generated/prisma/enums.js';

describe('Proposal Acceptance Evidence & Notifications (Phase 2 Day 14)', () => {
  const agentId = 'user-agent-1111-1111-111111111111';
  const staffId = 'user-staff-2222-2222-222222222222';
  const customerId = 'cust-1111-1111-1111-111111111111';
  const jobId = 'job-1111-1111-1111-111111111111';
  const quotationId = 'quot-1111-1111-1111-111111111111';
  const proposalId = 'prop-1111-1111-1111-111111111111';

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
  let mockStorage: any;

  let inMemoryJob: any;
  let inMemoryProposals: any[];
  let inMemoryAcceptances: any[];
  let inMemoryDocuments: any[];
  let inMemoryQuotations: any[];

  beforeEach(() => {
    inMemoryJob = {
      id: jobId,
      jobNo: 'JOB-2026-0001',
      status: 'WAITING_CUSTOMER',
      version: 1,
      productId: 'prod-1',
      customerId,
      createdById: agentId,
      agentId,
      brokerStaffId: staffId,
      assignedToId: staffId,
      selectedQuotationId: quotationId,
      customer: {
        id: customerId,
        firstName: 'Somchai',
        lastName: 'Jaidee',
        companyName: null,
      },
    };

    inMemoryProposals = [
      {
        id: proposalId,
        proposalNo: 'PR-2026-0001',
        jobId,
        quotationId,
        customerId,
        version: 1,
        status: 'SENT',
        proposalDate: new Date('2026-01-01'),
        validUntil: new Date('2026-12-31'),
        approvals: [],
        acceptances: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ];

    inMemoryAcceptances = [];
    inMemoryDocuments = [];
    inMemoryQuotations = [
      {
        id: quotationId,
        grossPremium: '10000',
        discount: '0',
        netPremium: '10000',
        totalAmount: '10000',
      },
    ];

    mockJobRepo = {
      findById: vi.fn(async (id: string) => (id === jobId ? inMemoryJob : null)),
      findUnique: vi.fn(async (args: any) => (args.where.id === jobId ? inMemoryJob : null)),
    };

    mockRepo = {
      findById: vi.fn(async (id: string) => {
        const p = inMemoryProposals.find((x) => x.id === id);
        if (!p) return null;
        const acceptances = inMemoryAcceptances
          .filter((a) => a.proposalId === id)
          .map((a) => {
            const doc = inMemoryDocuments.find((d) => d.id === a.evidenceFileId);
            return {
              ...a,
              evidenceFile: doc
                ? {
                    id: doc.id,
                    originalName: doc.originalName,
                    storedName: doc.storedName,
                    mimeType: doc.mimeType,
                    size: doc.size,
                  }
                : null,
              recordedBy: { id: a.recordedById, username: 'agent1', fullName: 'Somchai Agent' },
            };
          });
        return {
          ...p,
          acceptances,
        };
      }),
      update: vi.fn(async (id: string, data: any) => {
        const p = inMemoryProposals.find((x) => x.id === id);
        if (p) Object.assign(p, data);
        return p;
      }),
    };

    mockSequence = { generateProposalNo: vi.fn(async () => 'PR-2026-0002') };
    mockAudit = { log: vi.fn(async () => {}) };
    mockNotifications = { emit: vi.fn(async () => {}) };
    mockDocument = {};
    mockScope = { jobViewScope: vi.fn(() => ({})) };
    mockStorage = {
      save: vi.fn(async () => {}),
      read: vi.fn(async () => Buffer.from('test')),
    };

    mockCls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return agentId;
        if (key === 'permissions') return ['proposal.accept', 'proposal.view', 'proposal.reject'];
        if (key === 'roles') return ['AGENT'];
        return null;
      }),
    };

    const mockTx = {
      job: {
        findFirst: vi.fn(async (args: any) => (args?.where?.id === jobId ? inMemoryJob : null)),
        updateMany: vi.fn(async (args: any) => {
          if (inMemoryJob.id === args.where.id && inMemoryJob.version === args.where.version) {
            inMemoryJob.status = args.data.status;
            inMemoryJob.version += 1;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      jobStatusHistory: {
        create: vi.fn(async () => ({})),
      },
      customer: {
        findFirst: vi.fn(async (args: any) => (args?.where?.id === customerId ? inMemoryJob.customer : null)),
      },
      quotation: {
        findFirst: vi.fn(async (args: any) => inMemoryQuotations.find((q) => q.id === args.where.id) ?? null),
      },
      approvalRule: {
        findMany: vi.fn(async () => []),
      },
      proposalAcceptance: {
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `acc-${Date.now()}`, ...data, createdAt: new Date() };
          inMemoryAcceptances.push(record);
          return record;
        }),
      },
      document: {
        create: vi.fn(async ({ data }: any) => {
          const doc = { id: `doc-${Date.now()}`, ...data, createdAt: new Date() };
          inMemoryDocuments.push(doc);
          return doc;
        }),
        findFirst: vi.fn(async (args: any) => inMemoryDocuments.find((d) => d.id === args.where.id && !d.deletedAt) ?? null),
      },
    };

    mockTxHost = { tx: mockTx };

    jobWorkflow = new JobWorkflowService(
      mockTxHost as any,
      mockJobRepo as any,
      mockAudit as any,
      mockScope as any,
      mockCls as any,
      {} as any,
      {} as any,
      {} as any,
    );
    proposalService = new ProposalService(
      mockRepo as any,
      mockSequence as any,
      mockAudit as any,
      mockTxHost as any,
      mockCls as any,
      jobWorkflow,
      mockDocument as any,
      mockScope as any,
      mockNotifications as any,
      mockStorage as any,
    );
  });

  describe('Validation rules (422 ACCEPTANCE_EVIDENCE_REQUIRED)', () => {
    it('EMAIL without evidence file or evidenceFileId throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', async () => {
      await expect(
        proposalService.accept(proposalId, { method: 'EMAIL' as any }),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });

    it('SIGNED_DOCUMENT without evidence file throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', async () => {
      await expect(
        proposalService.accept(proposalId, { method: 'SIGNED_DOCUMENT' as any }),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });

    it('LINE without evidence file throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', async () => {
      await expect(
        proposalService.accept(proposalId, { method: 'LINE' as any }),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });

    it('MANUAL without remark throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', async () => {
      await expect(
        proposalService.accept(proposalId, { method: 'MANUAL' as any }),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });

    it('MANUAL with whitespace remark throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', async () => {
      await expect(
        proposalService.accept(proposalId, { method: 'MANUAL' as any, remark: '   ' }),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });

    it('empty payload defaults to EMAIL and throws 422 if no file provided', async () => {
      await expect(
        proposalService.accept(proposalId, {} as any),
      ).rejects.toMatchObject({
        code: 'ACCEPTANCE_EVIDENCE_REQUIRED',
        status: 422,
      });
    });
  });

  describe('Successful acceptance with MANUAL method', () => {
    it('accepts proposal with MANUAL and remark, emits CUSTOMER_ACCEPTED notification, records audit', async () => {
      const result = await proposalService.accept(
        proposalId,
        {
          method: 'MANUAL' as any,
          remark: 'Customer confirmed verbally by telephone',
          acceptedByName: 'Somchai Jaidee',
        },
        undefined,
        '192.168.1.100',
      );

      expect(result.status).toBe('ACCEPTED');
      expect(inMemoryJob.status).toBe('CUSTOMER_ACCEPTED');

      // Verify acceptance record in memory
      expect(inMemoryAcceptances).toHaveLength(1);
      expect(inMemoryAcceptances[0].method).toBe('MANUAL');
      expect(inMemoryAcceptances[0].remark).toBe('Customer confirmed verbally by telephone');
      expect(inMemoryAcceptances[0].acceptedByName).toBe('Somchai Jaidee');
      expect(inMemoryAcceptances[0].ipAddress).toBe('192.168.1.100');
      expect(inMemoryAcceptances[0].proposalVersion).toBe(1);

      // Verify notification emitted to owner (agent) and staff
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        NotificationType.CUSTOMER_ACCEPTED,
        expect.arrayContaining([agentId, staffId]),
        expect.objectContaining({
          entityType: 'PROPOSAL',
          entityId: proposalId,
          jobId,
        }),
      );

      // Verify audit log
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCEPT_PROPOSAL',
          entityType: 'PROPOSAL',
          entityId: proposalId,
          jobId,
          after: expect.objectContaining({
            status: 'ACCEPTED',
            method: 'MANUAL',
          }),
        }),
      );

      // Verify response contains latestAcceptance
      expect(result.latestAcceptance).toBeDefined();
      expect(result.latestAcceptance?.method).toBe('MANUAL');
      expect(result.latestAcceptance?.remark).toBe('Customer confirmed verbally by telephone');
    });
  });

  describe('Successful acceptance with multipart evidence file', () => {
    it('accepts proposal with EMAIL and uploaded file, saves file via StorageService, creates Document and links to acceptance', async () => {
      const mockFile = {
        originalname: 'customer-approval-email.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('PDF content'),
      } as Express.Multer.File;

      const result = await proposalService.accept(
        proposalId,
        {
          method: 'EMAIL' as any,
        },
        mockFile,
        '10.0.0.1',
      );

      expect(result.status).toBe('ACCEPTED');
      expect(mockStorage.save).toHaveBeenCalled();

      // Check document created
      expect(inMemoryDocuments).toHaveLength(1);
      expect(inMemoryDocuments[0].originalName).toBe('customer-approval-email.pdf');
      expect(inMemoryDocuments[0].documentType).toBe('OTHER');

      // Check acceptance record
      expect(inMemoryAcceptances).toHaveLength(1);
      expect(inMemoryAcceptances[0].method).toBe('EMAIL');
      expect(inMemoryAcceptances[0].evidenceFileId).toBe(inMemoryDocuments[0].id);

      // Verify response latestAcceptance includes evidence file
      expect(result.latestAcceptance?.evidenceFile?.originalName).toBe('customer-approval-email.pdf');

      // getAcceptance retrieves acceptance
      const acc = await proposalService.getAcceptance(proposalId);
      expect(acc.method).toBe('EMAIL');
      expect(acc.evidenceFileId).toBe(inMemoryDocuments[0].id);
    });
  });

  describe('Successful acceptance with existing evidenceFileId', () => {
    it('links pre-uploaded evidence document', async () => {
      const existingDoc = {
        id: 'doc-preuploaded-123',
        jobId,
        documentType: 'OTHER',
        originalName: 'signed-doc.pdf',
        storedName: '123-signed.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: '2026/01/job-1/123-signed.pdf',
        deletedAt: null,
      };
      inMemoryDocuments.push(existingDoc);

      const result = await proposalService.accept(
        proposalId,
        {
          method: 'SIGNED_DOCUMENT' as any,
          evidenceFileId: existingDoc.id,
        },
      );

      expect(result.status).toBe('ACCEPTED');
      expect(inMemoryAcceptances).toHaveLength(1);
      expect(inMemoryAcceptances[0].evidenceFileId).toBe(existingDoc.id);
      expect(result.latestAcceptance?.method).toBe('SIGNED_DOCUMENT');
    });

    it('throws 404 DOCUMENT_NOT_FOUND if evidenceFileId does not belong to job', async () => {
      await expect(
        proposalService.accept(proposalId, {
          method: 'EMAIL' as any,
          evidenceFileId: 'non-existent-doc-id',
        }),
      ).rejects.toMatchObject({
        code: 'DOCUMENT_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('Reject proposal & CUSTOMER_REJECTED notification', () => {
    it('rejects proposal and emits CUSTOMER_REJECTED notification to job owner and staff', async () => {
      const result = await proposalService.reject(proposalId, {
        rejectReason: 'PRICE' as any,
        remark: 'Price too high compared to competitor',
      });

      expect(result.status).toBe('REJECTED');
      expect(inMemoryJob.status).toBe('CUSTOMER_REJECTED');

      // Verify CUSTOMER_REJECTED notification emitted
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        NotificationType.CUSTOMER_REJECTED,
        expect.arrayContaining([agentId, staffId]),
        expect.objectContaining({
          title: expect.stringContaining('ลูกค้าปฏิเสธข้อเสนอ'),
          entityType: 'PROPOSAL',
          entityId: proposalId,
          jobId,
        }),
      );

      // Verify audit log
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECT_PROPOSAL',
          entityType: 'PROPOSAL',
          entityId: proposalId,
          jobId,
        }),
      );
    });
  });

  describe('getAcceptance query', () => {
    it('throws 404 ACCEPTANCE_NOT_FOUND if proposal has no acceptance record', async () => {
      await expect(proposalService.getAcceptance(proposalId)).rejects.toMatchObject({
        code: 'ACCEPTANCE_NOT_FOUND',
        status: 404,
      });
    });
  });
});
