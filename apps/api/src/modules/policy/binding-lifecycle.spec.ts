import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { PolicyService } from './policy.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PolicyRepository } from './policy.repository.js';
import type { SequenceService } from '../../common/sequence/sequence.service.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import type { DataScopeService } from '../../common/access/data-scope.service.js';
import type { JobWorkflowService } from '../job/job-workflow.service.js';

describe('Day 19 — Binding Lifecycle & Cancel Request', () => {
  const currentUserId = 'user-00000000-0000-0000-0000-000000000001';

  const mockRepo = {
    findBindingByIdempotencyKey: vi.fn(),
    findBindingByJobId: vi.fn(),
    findBindingById: vi.fn(),
    createBinding: vi.fn(),
    updateBinding: vi.fn(),
    saveIdempotencyKey: vi.fn(),
    findPolicyById: vi.fn(),
    createPolicy: vi.fn(),
  } as unknown as PolicyRepository;

  const mockSequence = {
    next: vi.fn(),
  } as unknown as SequenceService;

  const mockAudit = {
    log: vi.fn(),
  } as unknown as AuditService;

  const mockCls = {
    get: vi.fn((key: string) => {
      if (key === 'userId') return currentUserId;
      if (key === 'permissions') return ['policy.create', 'job.cancel', 'job.update'];
      return undefined;
    }),
  } as unknown as ClsService<AppClsStore>;

  const mockScope = {
    canUpdateJob: vi.fn(() => true),
    jobViewScope: vi.fn(() => ({})),
  } as unknown as DataScopeService;

  const mockWorkflow = {
    transitionInTx: vi.fn(),
  } as unknown as JobWorkflowService;

  const createService = (txOverrides: Record<string, unknown> = {}) => {
    const mockTxHost = {
      tx: {
        job: { findFirst: vi.fn(), updateMany: vi.fn() },
        proposal: { findFirst: vi.fn() },
        approval: { findFirst: vi.fn() },
        quotation: { findFirst: vi.fn() },
        insuranceProduct: { findFirst: vi.fn() },
        documentChecklist: { findMany: vi.fn() },
        document: { findMany: vi.fn() },
        ...txOverrides,
      },
    };

    return new PolicyService(
      mockRepo,
      mockSequence,
      mockAudit,
      mockTxHost as never,
      mockCls,
      mockScope,
      mockWorkflow,
    );
  };

  describe('bind()', () => {
    it('sets Binding status to SUBMITTED and transitions Job to BINDING (single-hop, no auto-hop to POLICY_PENDING)', async () => {
      const jobId = 'job-1';
      const quotationId = 'quot-1';
      const companyId = 'comp-1';

      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'CUSTOMER_ACCEPTED',
            selectedQuotationId: quotationId,
            productId: 'prod-1',
            effectiveDate: new Date('2026-11-01'),
            agentId: currentUserId,
          }),
        },
        proposal: {
          findFirst: vi.fn().mockResolvedValue({ id: 'prop-1', status: 'ACCEPTED' }),
        },
        approval: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        insuranceProduct: {
          findFirst: vi.fn().mockResolvedValue({ id: 'prod-1', requireDocsOnBind: false }),
        },
        quotation: {
          findFirst: vi.fn().mockResolvedValue({
            id: quotationId,
            insuranceCompanyId: companyId,
            totalAmount: '12000.00',
          }),
        },
      });

      vi.mocked(mockRepo.findBindingByJobId).mockResolvedValue(null);
      vi.mocked(mockRepo.createBinding).mockResolvedValue({
        id: 'bind-1',
        jobId,
        quotationId,
        status: 'SUBMITTED',
        bindingDate: new Date('2026-10-09'),
        effectiveDate: new Date('2026-11-01'),
        expiryDate: null,
        binderNumber: null,
        binderDate: null,
        insurerId: companyId,
        premium: '12000.00' as never,
        paymentCondition: null,
        underwriter: null,
        binderDocumentId: null,
        confirmedById: null,
        remark: 'testing bind',
        rejectionReason: null,
        cancelledAt: null,
        cancelledById: null,
        createdAt: new Date('2026-10-09T09:00:00Z'),
        updatedAt: new Date('2026-10-09T09:00:00Z'),
      } as never);

      const result = await service.bind(jobId, { remark: 'testing bind' });

      expect(result.status).toBe('SUBMITTED');
      expect(result.jobId).toBe(jobId);
      // Job transitions only to BINDING (single-hop)
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledTimes(1);
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId }),
        'BINDING',
        currentUserId,
      );
    });

    it('rejects with 422 BINDING_DOCUMENTS_NOT_VERIFIED if requireDocsOnBind is true and documents are not VERIFIED (D-22)', async () => {
      const jobId = 'job-doc-test';
      const quotationId = 'quot-1';

      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'CUSTOMER_ACCEPTED',
            selectedQuotationId: quotationId,
            productId: 'prod-doc-req',
            agentId: currentUserId,
          }),
        },
        proposal: { findFirst: vi.fn().mockResolvedValue({ id: 'prop-1', status: 'ACCEPTED' }) },
        approval: { findFirst: vi.fn().mockResolvedValue(null) },
        insuranceProduct: {
          findFirst: vi.fn().mockResolvedValue({ id: 'prod-doc-req', requireDocsOnBind: true }),
        },
        documentChecklist: {
          findMany: vi.fn().mockResolvedValue([
            { documentType: 'ID_CARD', isRequired: true, active: true },
          ]),
        },
        document: {
          findMany: vi.fn().mockResolvedValue([
            // Status is UPLOADED, not VERIFIED
            { documentType: 'ID_CARD', status: 'UPLOADED', deletedAt: null },
          ]),
        },
      });

      await expect(service.bind(jobId, {})).rejects.toThrow(BusinessException);
      await expect(service.bind(jobId, {})).rejects.toMatchObject({
        code: 'BINDING_DOCUMENTS_NOT_VERIFIED',
      });
    });
  });

  describe('confirmBinding()', () => {
    it('transitions Binding to CONFIRMED and Job from BINDING to POLICY_PENDING', async () => {
      const jobId = 'job-confirm';

      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'BINDING',
            agentId: currentUserId,
          }),
        },
      });

      vi.mocked(mockRepo.findBindingByJobId).mockResolvedValue({
        id: 'bind-conf-1',
        jobId,
        quotationId: 'quot-1',
        status: 'SUBMITTED',
      } as never);

      vi.mocked(mockRepo.updateBinding).mockResolvedValue({
        id: 'bind-conf-1',
        jobId,
        quotationId: 'quot-1',
        status: 'CONFIRMED',
        binderNumber: 'BN-8888',
        binderDate: new Date('2026-10-09'),
        bindingDate: new Date('2026-10-09'),
        effectiveDate: new Date('2026-11-01'),
        expiryDate: null,
        insurerId: null,
        premium: null,
        paymentCondition: null,
        underwriter: 'UW John',
        binderDocumentId: null,
        confirmedById: currentUserId,
        remark: 'confirmed ok',
        rejectionReason: null,
        cancelledAt: null,
        cancelledById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await service.confirmBinding(jobId, {
        binderNumber: 'BN-8888',
        underwriter: 'UW John',
      });

      expect(res.status).toBe('CONFIRMED');
      expect(res.binderNumber).toBe('BN-8888');
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId }),
        'POLICY_PENDING',
        currentUserId,
      );
    });

    it('throws 409 if job is not in BINDING status', async () => {
      const jobId = 'job-not-binding';
      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'CUSTOMER_ACCEPTED',
            agentId: currentUserId,
          }),
        },
      });

      await expect(service.confirmBinding(jobId, {})).rejects.toThrow(BusinessException);
      await expect(service.confirmBinding(jobId, {})).rejects.toMatchObject({
        code: 'JOB_INVALID_STATUS',
      });
    });
  });

  describe('insurerRejectBinding()', () => {
    it('sets Binding to REJECTED with reason, returns Job to APPROVED if approval existed', async () => {
      const jobId = 'job-reject-with-approval';

      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'BINDING',
            agentId: currentUserId,
          }),
        },
        approval: {
          findFirst: vi.fn().mockResolvedValue({ id: 'appr-1', status: 'APPROVED' }),
        },
      });

      vi.mocked(mockRepo.findBindingByJobId).mockResolvedValue({
        id: 'bind-rej-1',
        jobId,
        quotationId: 'quot-1',
        status: 'SUBMITTED',
      } as never);

      vi.mocked(mockRepo.updateBinding).mockResolvedValue({
        id: 'bind-rej-1',
        jobId,
        quotationId: 'quot-1',
        status: 'REJECTED',
        bindingDate: new Date('2026-10-09'),
        effectiveDate: new Date('2026-11-01'),
        expiryDate: null,
        rejectionReason: 'Risk unacceptable by reinsurer',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await service.insurerRejectBinding(jobId, {
        reason: 'Risk unacceptable by reinsurer',
      });

      expect(res.status).toBe('REJECTED');
      expect(res.rejectionReason).toBe('Risk unacceptable by reinsurer');
      // Transitions Job back to APPROVED because approval existed
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId }),
        'APPROVED',
        currentUserId,
        { reason: 'Risk unacceptable by reinsurer' },
      );
    });

    it('sets Binding to REJECTED with reason, returns Job to CUSTOMER_ACCEPTED if no approval', async () => {
      const jobId = 'job-reject-no-approval';

      const service = createService({
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: jobId,
            status: 'BINDING',
            agentId: currentUserId,
          }),
        },
        approval: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      });

      vi.mocked(mockRepo.findBindingByJobId).mockResolvedValue({
        id: 'bind-rej-2',
        jobId,
        quotationId: 'quot-1',
        status: 'SUBMITTED',
      } as never);

      vi.mocked(mockRepo.updateBinding).mockResolvedValue({
        id: 'bind-rej-2',
        jobId,
        quotationId: 'quot-1',
        status: 'REJECTED',
        bindingDate: new Date('2026-10-09'),
        effectiveDate: new Date('2026-11-01'),
        expiryDate: null,
        rejectionReason: 'Capacity full',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await service.insurerRejectBinding(jobId, {
        reason: 'Capacity full',
      });

      expect(res.status).toBe('REJECTED');
      // Transitions Job back to CUSTOMER_ACCEPTED
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId }),
        'CUSTOMER_ACCEPTED',
        currentUserId,
        { reason: 'Capacity full' },
      );
    });
  });

  describe('Job Cancel V2 (D-26)', () => {
    it('blocks direct transition to CANCELLED from BINDING and requires approval', async () => {
      const { JobWorkflowService } = await import('../job/job-workflow.service.js');
      const mockJobRepo = {
        findById: vi.fn().mockResolvedValue({
          id: 'job-cancel-test',
          status: 'BINDING',
          agentId: currentUserId,
          version: 1,
        }),
      };
      const mockTxHost = {
        tx: {
          job: { updateMany: vi.fn(), update: vi.fn() },
          jobStatusHistory: { create: vi.fn() },
          binding: { updateMany: vi.fn() },
        },
      };

      const wf = new JobWorkflowService(
        mockTxHost as never,
        mockJobRepo as never,
        mockAudit,
        mockScope,
        mockCls,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(wf.transition('job-cancel-test', 'CANCELLED', { reason: 'Direct cancel' })).rejects.toThrow(
        BusinessException,
      );
      await expect(wf.transition('job-cancel-test', 'CANCELLED', { reason: 'Direct cancel' })).rejects.toMatchObject({
        code: 'JOB_CANCEL_REQUIRES_APPROVAL',
      });
    });

    it('allows direct transition to CANCELLED from OPEN/WAITING_CUSTOMER/CUSTOMER_ACCEPTED', async () => {
      const { JobWorkflowService } = await import('../job/job-workflow.service.js');
      const mockJob = {
        id: 'job-cancel-direct',
        jobNo: 'JOB-2026-001',
        status: 'CUSTOMER_ACCEPTED',
        agentId: currentUserId,
        customerId: 'cust-1',
        insuranceTypeId: 'it-1',
        productId: 'prod-1',
        effectiveDate: new Date('2026-11-01'),
        priority: 'NORMAL',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockJobRepo = {
        findById: vi.fn()
          .mockResolvedValueOnce(mockJob)
          .mockResolvedValueOnce({ ...mockJob, status: 'CANCELLED' }),
      };
      const mockTxHost = {
        tx: {
          job: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          jobStatusHistory: { create: vi.fn() },
          binding: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        },
      };

      const wf = new JobWorkflowService(
        mockTxHost as never,
        mockJobRepo as never,
        mockAudit,
        mockScope,
        mockCls,
        {} as never,
        {} as never,
        {} as never,
      );

      const res = await wf.transition('job-cancel-direct', 'CANCELLED', { reason: 'Customer changed mind' });
      expect(res.status).toBe('CANCELLED');
    });

    it('requestCancel records cancel request fields on Job at BINDING status', async () => {
      const { JobWorkflowService } = await import('../job/job-workflow.service.js');
      const mockJob = {
        id: 'job-req-cancel',
        jobNo: 'JOB-2026-002',
        status: 'BINDING',
        agentId: currentUserId,
        customerId: 'cust-1',
        insuranceTypeId: 'it-1',
        productId: 'prod-1',
        effectiveDate: new Date('2026-11-01'),
        priority: 'NORMAL',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockJobRepo = {
        findById: vi.fn().mockResolvedValue(mockJob),
      };
      const mockJobUpdate = vi.fn().mockResolvedValue({});
      const mockTxHost = {
        tx: {
          job: { update: mockJobUpdate },
        },
      };

      const wf = new JobWorkflowService(
        mockTxHost as never,
        mockJobRepo as never,
        mockAudit,
        mockScope,
        mockCls,
        {} as never,
        {} as never,
        {} as never,
      );

      await wf.requestCancel('job-req-cancel', { reason: 'Insurer quote withdrawn' });

      expect(mockJobUpdate).toHaveBeenCalledWith({
        where: { id: 'job-req-cancel' },
        data: expect.objectContaining({
          cancelRequestReason: 'Insurer quote withdrawn',
          cancelRequestedById: currentUserId,
        }),
      });
    });

    it('approveCancel transitions Job to CANCELLED and marks active Binding as CANCELLED', async () => {
      const { JobWorkflowService } = await import('../job/job-workflow.service.js');
      const mockJob = {
        id: 'job-appr-cancel',
        jobNo: 'JOB-2026-003',
        status: 'BINDING',
        cancelRequestReason: 'Customer requested',
        cancelRequestedAt: new Date('2026-10-01'),
        cancelRequestedById: 'user-00000000-0000-0000-0000-000000000099',
        agentId: currentUserId,
        customerId: 'cust-1',
        insuranceTypeId: 'it-1',
        productId: 'prod-1',
        effectiveDate: new Date('2026-11-01'),
        priority: 'NORMAL',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockJobRepo = {
        findById: vi.fn()
          .mockResolvedValueOnce(mockJob)
          .mockResolvedValueOnce({ ...mockJob, status: 'CANCELLED' }),
      };
      const mockJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      const mockBindingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      const mockTxHost = {
        tx: {
          job: { updateMany: mockJobUpdateMany },
          jobStatusHistory: { create: vi.fn() },
          binding: { updateMany: mockBindingUpdateMany },
        },
      };

      const wf = new JobWorkflowService(
        mockTxHost as never,
        mockJobRepo as never,
        mockAudit,
        mockScope,
        mockCls,
        {} as never,
        {} as never,
        {} as never,
      );

      const res = await wf.approveCancel('job-appr-cancel', { reason: 'Manager approved' });

      expect(res.status).toBe('CANCELLED');
      expect(mockBindingUpdateMany).toHaveBeenCalledWith({
        where: {
          jobId: 'job-appr-cancel',
          status: { in: ['PENDING', 'SUBMITTED', 'CONFIRMED'] },
        },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledById: currentUserId,
        }),
      });
    });
  });
});
