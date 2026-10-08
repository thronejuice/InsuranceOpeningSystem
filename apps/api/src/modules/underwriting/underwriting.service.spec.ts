import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { BusinessException } from '../../common/errors/business.exception.js';
import { UnderwritingStatus } from '../../generated/prisma/enums.js';
import { UnderwritingService } from './underwriting.service.js';

describe('UnderwritingService (unit)', () => {
  let service: UnderwritingService;
  let mockDb: any;
  let mockTxHost: any;
  let mockRepo: any;
  let mockScope: any;
  let mockAudit: any;
  let mockCls: any;
  let mockDocSvc: any;
  let mockWorkflow: any;
  let mockNotifSvc: any;

  const requesterId = 'user-requester-1111-1111-111111111111';
  const underwriterId = 'user-underwriter-2222-2222-222222222222';
  const jobId = 'job-1111-1111-1111-111111111111';
  const prodId = 'prod-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockDb = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: jobId,
          jobNo: 'JOB-2026-0001',
          status: 'OPEN',
          agentId: requesterId,
          brokerStaffId: 'staff-1',
          productId: prodId,
          product: { id: prodId, code: 'MOTOR_COMM', name: 'Motor Commercial', requireUnderwriting: true },
        }),
      },
    };

    mockTxHost = { tx: mockDb };

    mockRepo = {
      findLatestByJobId: vi.fn(),
      findByJobId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findPendingInbox: vi.fn(),
    };

    mockScope = {
      jobViewScope: vi.fn().mockReturnValue({}),
      canUpdateJob: vi.fn().mockReturnValue(true),
    };

    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockCls = { get: vi.fn().mockReturnValue(requesterId) };
    mockDocSvc = { checkDocumentsComplete: vi.fn().mockResolvedValue([]) };
    mockWorkflow = { transitionInTx: vi.fn().mockResolvedValue(undefined) };
    mockNotifSvc = { emit: vi.fn().mockResolvedValue(undefined) };

    service = new UnderwritingService(
      mockTxHost,
      mockRepo,
      mockScope,
      mockAudit,
      mockCls,
      mockDocSvc,
      mockWorkflow,
      mockNotifSvc,
    );
  });

  describe('requestReview', () => {
    it('creates PENDING underwriting version 1 when all docs are VERIFIED and job is OPEN', async () => {
      mockRepo.findLatestByJobId.mockResolvedValue(null);
      mockRepo.create.mockImplementation((_data: any) => ({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.PENDING,
        requestedById: requesterId,
        requestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await service.requestReview(jobId, { reason: 'Ready for assessment' });

      expect(res.version).toBe(1);
      expect(res.status).toBe(UnderwritingStatus.PENDING);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          status: UnderwritingStatus.PENDING,
          reason: 'Ready for assessment',
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UNDERWRITING_REQUESTED' }),
      );
    });

    it('creates version 2 when re-requesting after previous decision', async () => {
      mockRepo.findLatestByJobId.mockResolvedValue({
        id: 'uw-1',
        version: 1,
        status: UnderwritingStatus.INFO_REQUIRED,
      });
      mockRepo.create.mockImplementation((_data: any) => ({
        id: 'uw-2',
        jobId,
        version: 2,
        status: UnderwritingStatus.PENDING,
        requestedById: requesterId,
        requestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await service.requestReview(jobId);
      expect(res.version).toBe(2);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2, status: UnderwritingStatus.PENDING }),
      );
    });

    it('throws JOB_INVALID_STATE (422) if Job is not OPEN', async () => {
      mockDb.job.findFirst.mockResolvedValue({
        id: jobId,
        status: 'DRAFT',
        agentId: requesterId,
      });

      await expect(service.requestReview(jobId)).rejects.toThrow(BusinessException);
      await expect(service.requestReview(jobId)).rejects.toMatchObject({
        code: 'JOB_INVALID_STATE',
        status: 422,
      });
    });

    it('throws DOCUMENTS_NOT_VERIFIED (422) if required documents are not all VERIFIED', async () => {
      mockDocSvc.checkDocumentsComplete.mockResolvedValue(['ID_CARD', 'VEHICLE_BOOK']);

      await expect(service.requestReview(jobId)).rejects.toThrow(BusinessException);
      await expect(service.requestReview(jobId)).rejects.toMatchObject({
        code: 'DOCUMENTS_NOT_VERIFIED',
        status: 422,
        errors: {
          ID_CARD: ['ID_CARD document must be VERIFIED'],
          VEHICLE_BOOK: ['VEHICLE_BOOK document must be VERIFIED'],
        },
      });
    });

    it('throws UNDERWRITING_ALREADY_PENDING (422) if review is already PENDING', async () => {
      mockRepo.findLatestByJobId.mockResolvedValue({
        id: 'uw-1',
        version: 1,
        status: UnderwritingStatus.PENDING,
      });

      await expect(service.requestReview(jobId)).rejects.toThrow(BusinessException);
      await expect(service.requestReview(jobId)).rejects.toMatchObject({
        code: 'UNDERWRITING_ALREADY_PENDING',
        status: 422,
      });
    });
  });

  describe('review', () => {
    beforeEach(() => {
      mockCls.get.mockReturnValue(underwriterId);
      mockRepo.findLatestByJobId.mockResolvedValue({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.PENDING,
        requestedById: requesterId,
      });
    });

    it('approves underwriting successfully with underwriter details', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.APPROVED,
        riskLevel: 'LOW',
        riskScore: 85,
        condition: 'Regular maintenance check',
        underwriterId,
        requestedById: requesterId,
        requestedAt: new Date(),
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.review(jobId, {
        status: UnderwritingStatus.APPROVED,
        riskLevel: 'LOW',
        riskScore: 85,
        condition: 'Regular maintenance check',
      });

      expect(res.status).toBe(UnderwritingStatus.APPROVED);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'uw-1',
        expect.objectContaining({
          status: UnderwritingStatus.APPROVED,
          underwriter: { connect: { id: underwriterId } },
          riskLevel: 'LOW',
        }),
      );
      expect(mockNotifSvc.emit).toHaveBeenCalledWith(
        'UNDERWRITING_APPROVED',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('throws RISK_LEVEL_REQUIRED (422) when approving without a riskLevel', async () => {
      mockCls.get.mockReturnValue(underwriterId);

      await expect(
        service.review(jobId, { status: UnderwritingStatus.APPROVED }),
      ).rejects.toMatchObject({
        code: 'RISK_LEVEL_REQUIRED',
        status: 422,
      });
    });

    it('enforces Maker-Checker rule: throws MAKER_CHECKER_VIOLATION (422) if requester reviews own request', async () => {
      mockCls.get.mockReturnValue(requesterId); // same user as requestedById

      await expect(
        service.review(jobId, { status: UnderwritingStatus.APPROVED }),
      ).rejects.toThrow(BusinessException);

      await expect(
        service.review(jobId, { status: UnderwritingStatus.APPROVED }),
      ).rejects.toMatchObject({
        code: 'MAKER_CHECKER_VIOLATION',
        status: 422,
      });
    });

    it('requires info: transitions Job to WAITING_INFORMATION and updates status to INFO_REQUIRED', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.INFO_REQUIRED,
        reason: 'Need vehicle inspection report',
        underwriterId,
        requestedById: requesterId,
        requestedAt: new Date(),
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.review(jobId, {
        status: UnderwritingStatus.INFO_REQUIRED,
        reason: 'Need vehicle inspection report',
      });

      expect(res.status).toBe(UnderwritingStatus.INFO_REQUIRED);
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.anything(),
        'WAITING_INFORMATION',
        underwriterId,
        expect.objectContaining({ reason: 'Underwriting requested info: Need vehicle inspection report' }),
      );
    });

    it('requires info throws REASON_REQUIRED (422) if reason is empty', async () => {
      await expect(
        service.review(jobId, { status: UnderwritingStatus.INFO_REQUIRED, reason: '   ' }),
      ).rejects.toMatchObject({
        code: 'REASON_REQUIRED',
        status: 422,
      });
    });

    it('rejects: transitions Job to CLOSED and updates status to REJECTED', async () => {
      mockRepo.update.mockResolvedValue({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.REJECTED,
        reason: 'Risk profile too high',
        underwriterId,
        requestedById: requesterId,
        requestedAt: new Date(),
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.review(jobId, {
        status: UnderwritingStatus.REJECTED,
        reason: 'Risk profile too high',
      });

      expect(res.status).toBe(UnderwritingStatus.REJECTED);
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.anything(),
        'CLOSED',
        underwriterId,
        expect.objectContaining({ reason: 'Underwriting rejected: Risk profile too high' }),
      );
    });

    it('rejects throws REASON_REQUIRED (422) if reason is empty', async () => {
      await expect(
        service.review(jobId, { status: UnderwritingStatus.REJECTED, reason: '' }),
      ).rejects.toMatchObject({
        code: 'REASON_REQUIRED',
        status: 422,
      });
    });
  });

  describe('resume', () => {
    it('transitions Job from WAITING_INFORMATION back to OPEN and resets underwriting to PENDING', async () => {
      mockDb.job.findFirst.mockResolvedValue({
        id: jobId,
        status: 'WAITING_INFORMATION',
        agentId: requesterId,
      });
      mockRepo.findLatestByJobId.mockResolvedValue({
        id: 'uw-1',
        status: UnderwritingStatus.INFO_REQUIRED,
      });
      mockRepo.update.mockResolvedValue({
        id: 'uw-1',
        jobId,
        version: 1,
        status: UnderwritingStatus.PENDING,
        requestedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.resume(jobId, 'Information updated by agent');

      expect(res.status).toBe(UnderwritingStatus.PENDING);
      expect(mockWorkflow.transitionInTx).toHaveBeenCalledWith(
        expect.anything(),
        'OPEN',
        requesterId,
        expect.objectContaining({ reason: 'Information updated by agent' }),
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        'uw-1',
        expect.objectContaining({ status: UnderwritingStatus.PENDING }),
      );
    });

    it('throws JOB_NOT_WAITING_INFO (422) if job is not WAITING_INFORMATION', async () => {
      mockDb.job.findFirst.mockResolvedValue({
        id: jobId,
        status: 'OPEN',
        agentId: requesterId,
      });

      await expect(service.resume(jobId)).rejects.toMatchObject({
        code: 'JOB_NOT_WAITING_INFO',
        status: 422,
      });
    });
  });

});
