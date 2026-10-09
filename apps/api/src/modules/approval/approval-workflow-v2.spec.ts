import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { ApprovalService } from './approval.service.js';

describe('ApprovalService Workflow V2 (Day 18)', () => {
  let approvalService: ApprovalService;
  let mockRepo: any;
  let mockAudit: any;
  let mockTxHost: any;
  let mockCls: any;
  let mockWorkflow: any;
  let mockNotifications: any;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findInbox: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    mockTxHost = {
      tx: {
        job: {
          findFirst: vi.fn(),
          update: vi.fn(),
        },
        document: {
          findMany: vi.fn(),
        },
        approval: {
          create: vi.fn(),
        },
        user: {
          findMany: vi.fn().mockResolvedValue([{ id: 'user-approver-1' }]),
        },
      },
    };

    mockCls = {
      get: vi.fn((key: string) => {
        if (key === 'userId') return 'user-manager-1';
        if (key === 'roles') return ['SUPERVISOR', 'MANAGER'];
        if (key === 'permissions') return ['approval.approve', 'approval.manage'];
        return null;
      }),
    };

    mockWorkflow = {
      transitionInTx: vi.fn().mockResolvedValue({}),
    };

    mockNotifications = {
      emit: vi.fn().mockResolvedValue({}),
    };

    const mockScope = {
      canUpdateJob: vi.fn().mockReturnValue(true),
    };

    approvalService = new ApprovalService(
      mockRepo,
      mockAudit,
      mockTxHost,
      mockCls,
      mockWorkflow,
      mockNotifications,
      mockScope as never,
    );
  });

  describe('reject()', () => {
    it('throws BusinessException 404 if approval does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        approvalService.reject('app-1', { reason: 'เอกสารไม่ครบ' }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_NOT_FOUND',
      });
    });

    it('throws BusinessException 409 if approval is not PENDING', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'app-1',
        status: 'APPROVED',
        requestedById: 'other-user',
        approvalType: 'DISCOUNT',
      });

      await expect(
        approvalService.reject('app-1', { reason: 'เอกสารไม่ครบ' }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_INVALID_STATUS',
      });
    });

    it('throws BusinessException 422 if reject reason is empty', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'app-1',
        status: 'PENDING',
        requestedById: 'other-user',
        approvalType: 'DISCOUNT',
      });

      await expect(
        approvalService.reject('app-1', { reason: '   ' }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('successfully rejects approval: marks REJECTED, transitions Job to APPROVAL_REJECTED, emits notification', async () => {
      const existingApproval = {
        id: 'app-1',
        jobId: 'job-1',
        status: 'PENDING',
        approvalType: 'DISCOUNT',
        requestedById: 'requester-1',
      };
      mockRepo.findById.mockResolvedValue(existingApproval);

      const jobRecord = {
        id: 'job-1',
        jobNo: 'JOB-202610-0001',
        status: 'WAITING_APPROVAL',
        createdById: 'agent-1',
        agentId: 'agent-1',
      };
      mockTxHost.tx.job.findFirst.mockResolvedValue(jobRecord);

      const updatedApproval = {
        ...existingApproval,
        status: 'REJECTED',
        rejectReason: 'ส่วนลดสูงเกินไป',
        comment: 'ให้แก้ไขเป็น 8%',
        rejectedAt: new Date(),
      };
      mockRepo.update.mockResolvedValue(updatedApproval);

      const res = await approvalService.reject('app-1', {
        reason: 'ส่วนลดสูงเกินไป',
        comment: 'ให้แก้ไขเป็น 8%',
      });

      expect(res.status).toBe('REJECTED');
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        jobRecord,
        'APPROVAL_REJECTED',
        'user-manager-1',
        { reason: 'ส่วนลดสูงเกินไป' },
      );
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        'APPROVAL_REJECTED',
        expect.arrayContaining(['agent-1', 'requester-1']),
        expect.objectContaining({
          title: expect.stringContaining('JOB-202610-0001'),
          entityType: 'APPROVAL',
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECT_APPROVAL',
          entityId: 'app-1',
        }),
      );
    });
  });

  describe('resubmit()', () => {
    it('throws BusinessException 404 if approval does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        approvalService.resubmit('app-1', { comment: 'แก้ไขแล้ว' }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_NOT_FOUND',
      });
    });

    it('throws BusinessException 409 if approval is not REJECTED', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'app-1',
        status: 'PENDING',
      });

      await expect(
        approvalService.resubmit('app-1', { comment: 'แก้ไขแล้ว' }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_INVALID_STATUS',
      });
    });

    it('throws BusinessException 409 if job is not in APPROVAL_REJECTED status', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'app-1',
        jobId: 'job-1',
        status: 'REJECTED',
      });
      mockTxHost.tx.job.findFirst.mockResolvedValue({
        id: 'job-1',
        status: 'WAITING_APPROVAL',
      });

      await expect(
        approvalService.resubmit('app-1', { comment: 'แก้ไขแล้ว' }),
      ).rejects.toMatchObject({
        code: 'JOB_INVALID_STATUS',
      });
    });

    it('successfully resubmits: marks old approval resubmitted, creates new PENDING approval, transitions Job to WAITING_APPROVAL, emits APPROVAL_REQUESTED', async () => {
      const oldApproval = {
        id: 'app-old',
        jobId: 'job-1',
        proposalId: 'prop-1',
        status: 'REJECTED',
        approvalType: 'DISCOUNT',
        step: 1,
        ruleId: 'rule-1',
      };
      mockRepo.findById.mockResolvedValue(oldApproval);

      const jobRecord = {
        id: 'job-1',
        jobNo: 'JOB-202610-0001',
        status: 'APPROVAL_REJECTED',
        createdById: 'agent-1',
      };
      mockTxHost.tx.job.findFirst.mockResolvedValue(jobRecord);

      mockRepo.update.mockResolvedValue({
        ...oldApproval,
        resubmittedById: 'user-manager-1',
        resubmittedAt: new Date(),
      });

      const newApprovalRecord = {
        id: 'app-new',
        jobId: 'job-1',
        proposalId: 'prop-1',
        status: 'PENDING',
        approvalType: 'DISCOUNT',
        step: 1,
        ruleId: 'rule-1',
        comment: 'แนบเอกสารเพิ่มเติมแล้ว',
      };
      mockTxHost.tx.approval.create.mockResolvedValue(newApprovalRecord);

      const res = await approvalService.resubmit('app-old', {
        comment: 'แนบเอกสารเพิ่มเติมแล้ว',
      });

      expect(res.id).toBe('app-new');
      expect(res.status).toBe('PENDING');

      expect(mockRepo.update).toHaveBeenCalledWith(
        'app-old',
        expect.objectContaining({
          resubmittedBy: { connect: { id: 'user-manager-1' } },
        }),
      );

      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        jobRecord,
        'WAITING_APPROVAL',
        'user-manager-1',
        { reason: 'แนบเอกสารเพิ่มเติมแล้ว' },
      );

      expect(mockNotifications.emit).toHaveBeenCalledWith(
        'APPROVAL_REQUESTED',
        expect.anything(),
        expect.objectContaining({
          title: expect.stringContaining('JOB-202610-0001'),
          entityType: 'APPROVAL',
        }),
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESUBMIT_APPROVAL',
          entityId: 'app-new',
        }),
      );
    });
  });
});
