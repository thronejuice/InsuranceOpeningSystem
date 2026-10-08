import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { BusinessException } from '../../common/errors/business.exception.js';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { DocumentService } from './document.service.js';

describe('DocumentService (unit)', () => {
  let service: DocumentService;
  let mockDb: any;
  let mockTxHost: any;
  let mockRepo: any;
  let mockStorage: any;
  let mockScope: any;
  let mockAudit: any;
  let mockCls: any;

  const userA = 'user-a-1111-1111-1111-111111111111';
  const userB = 'user-b-2222-2222-2222-222222222222';
  const jobId = 'job-1111-1111-1111-111111111111';
  const docId = 'doc-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockDb = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: jobId,
          agentId: userA,
          productId: 'prod-1',
        }),
      },
    };

    mockTxHost = {
      tx: mockDb,
    };

    mockRepo = {
      findByJobId: vi.fn(),
      findById: vi.fn(),
      findLatestByJobAndType: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      getChecklist: vi.fn(),
      expireOutdatedDocuments: vi.fn(),
    };

    mockStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    };

    mockScope = {
      jobViewScope: vi.fn().mockReturnValue({}),
      canUpdateJob: vi.fn().mockReturnValue(true),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    mockCls = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'userId') return userB;
        if (key === 'permissions') return ['document.verify'];
        return undefined;
      }),
    };

    service = new DocumentService(
      mockTxHost,
      mockRepo,
      mockStorage,
      mockScope,
      mockAudit,
      mockCls,
    );
  });

  describe('upload', () => {
    const validPdfBuffer = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      0x25, 0x25, 0x45, 0x4f, 0x46,
    ]);
    const mockFile = {
      originalname: 'id_card.pdf',
      buffer: validPdfBuffer,
      size: validPdfBuffer.length,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    it('uploads version 1 when no prior document exists', async () => {
      mockRepo.findLatestByJobAndType.mockResolvedValue(null);
      mockRepo.create.mockImplementation((data: any) =>
        Promise.resolve({
          id: docId,
          jobId,
          documentType: 'ID_CARD',
          originalName: 'id_card.pdf',
          mimeType: 'application/pdf',
          size: validPdfBuffer.length,
          version: data.version,
          status: DocumentStatus.UPLOADED,
          uploadedById: userB,
          uploadedBy: { id: userB, username: 'user_b', fullName: 'User B' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.upload(jobId, { documentType: 'ID_CARD' as any }, mockFile);

      expect(result.version).toBe(1);
      expect(result.status).toBe(DocumentStatus.UPLOADED);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          status: DocumentStatus.UPLOADED,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPLOAD_DOCUMENT',
          entityType: 'DOCUMENT',
          newValue: expect.objectContaining({ version: 1 }),
        }),
      );
    });

    it('increments version to 2 when duplicate documentType uploaded without deleting old version', async () => {
      mockRepo.findLatestByJobAndType.mockResolvedValue({
        id: 'old-doc-id',
        version: 1,
        documentType: 'ID_CARD',
      });
      mockRepo.create.mockImplementation((data: any) =>
        Promise.resolve({
          id: 'new-doc-id',
          jobId,
          documentType: 'ID_CARD',
          originalName: 'id_card_v2.pdf',
          mimeType: 'application/pdf',
          size: validPdfBuffer.length,
          version: data.version,
          status: DocumentStatus.UPLOADED,
          uploadedById: userB,
          uploadedBy: { id: userB, username: 'user_b', fullName: 'User B' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.upload(jobId, { documentType: 'ID_CARD' as any }, mockFile);

      expect(result.version).toBe(2);
      expect(mockRepo.softDelete).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
        }),
      );
    });
  });

  describe('verify', () => {
    it('succeeds when verified by another user', async () => {
      // Document was uploaded by userA; current user is userB
      mockRepo.findById.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        originalName: 'id.pdf',
        mimeType: 'application/pdf',
        size: 100,
        version: 1,
        status: DocumentStatus.UPLOADED,
        uploadedById: userA,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockRepo.update.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        originalName: 'id.pdf',
        mimeType: 'application/pdf',
        size: 100,
        version: 1,
        status: DocumentStatus.VERIFIED,
        uploadedById: userA,
        verifiedById: userB,
        verifiedBy: { id: userB, username: 'user_b', fullName: 'User B' },
        verifiedAt: new Date(),
        remark: 'Approved by supervisor',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.verify(docId, { remark: 'Approved by supervisor' });

      expect(res.status).toBe(DocumentStatus.VERIFIED);
      expect(res.verifiedById).toBe(userB);
      expect(mockRepo.update).toHaveBeenCalledWith(
        docId,
        expect.objectContaining({
          status: DocumentStatus.VERIFIED,
          remark: 'Approved by supervisor',
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VERIFY_DOCUMENT',
          entityId: docId,
        }),
      );
    });

    it('maker-checker rule: throws 422 MAKER_CHECKER_VIOLATION when uploader attempts to verify own document', async () => {
      // Document was uploaded by userB; current user in CLS is also userB
      mockRepo.findById.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        uploadedById: userB, // Same user!
        status: DocumentStatus.UPLOADED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.verify(docId, {})).rejects.toThrow(BusinessException);
      try {
        await service.verify(docId, {});
      } catch (err: any) {
        expect(err.code).toBe('MAKER_CHECKER_VIOLATION');
        expect(err.getStatus()).toBe(422);
      }
    });

    it('throws 422 DOCUMENT_EXPIRED when attempting to verify an already expired document', async () => {
      mockRepo.findById.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        uploadedById: userA,
        status: DocumentStatus.EXPIRED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.verify(docId, {})).rejects.toThrow(BusinessException);
      try {
        await service.verify(docId, {});
      } catch (err: any) {
        expect(err.code).toBe('DOCUMENT_EXPIRED');
        expect(err.getStatus()).toBe(422);
      }
    });
  });

  describe('reject', () => {
    it('succeeds when rejected by another user with required reason', async () => {
      mockRepo.findById.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        originalName: 'id.pdf',
        mimeType: 'application/pdf',
        size: 100,
        version: 1,
        status: DocumentStatus.UPLOADED,
        uploadedById: userA,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockRepo.update.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        originalName: 'id.pdf',
        mimeType: 'application/pdf',
        size: 100,
        version: 1,
        status: DocumentStatus.REJECTED,
        uploadedById: userA,
        verifiedById: userB,
        verifiedBy: { id: userB, username: 'user_b', fullName: 'User B' },
        verifiedAt: new Date(),
        remark: 'Blurry photo',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.reject(docId, { reason: 'Blurry photo' });

      expect(res.status).toBe(DocumentStatus.REJECTED);
      expect(res.remark).toBe('Blurry photo');
      expect(mockRepo.update).toHaveBeenCalledWith(
        docId,
        expect.objectContaining({
          status: DocumentStatus.REJECTED,
          remark: 'Blurry photo',
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECT_DOCUMENT',
          entityId: docId,
        }),
      );
    });

    it('maker-checker rule: throws 422 MAKER_CHECKER_VIOLATION when uploader attempts to reject own document', async () => {
      mockRepo.findById.mockResolvedValue({
        id: docId,
        jobId,
        documentType: 'ID_CARD',
        uploadedById: userB, // Same user!
        status: DocumentStatus.UPLOADED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.reject(docId, { reason: 'No good' })).rejects.toThrow(BusinessException);
      try {
        await service.reject(docId, { reason: 'No good' });
      } catch (err: any) {
        expect(err.code).toBe('MAKER_CHECKER_VIOLATION');
        expect(err.getStatus()).toBe(422);
      }
    });
  });

  describe('getChecklist & checkDocumentsComplete', () => {
    it('returns isComplete=false when required documents are expired or missing', async () => {
      mockRepo.getChecklist.mockResolvedValue([
        { documentType: 'ID_CARD', isRequired: true },
        { documentType: 'VEHICLE_BOOK', isRequired: true },
      ]);
      // ID_CARD is expired; VEHICLE_BOOK is not uploaded
      mockRepo.findByJobId.mockResolvedValue([
        {
          id: docId,
          documentType: 'ID_CARD',
          originalName: 'id.pdf',
          version: 1,
          status: DocumentStatus.EXPIRED,
          expiryDate: new Date('2020-01-01'),
        },
      ]);

      const res = await service.getChecklist(jobId);

      expect(res.isComplete).toBe(false);
      expect(res.missing).toContain('ID_CARD');
      expect(res.missing).toContain('VEHICLE_BOOK');
    });

    it('returns isComplete=true when all required documents have valid non-expired latest versions', async () => {
      mockRepo.getChecklist.mockResolvedValue([
        { documentType: 'ID_CARD', isRequired: true },
      ]);
      mockRepo.findByJobId.mockResolvedValue([
        {
          id: docId,
          documentType: 'ID_CARD',
          originalName: 'id.pdf',
          version: 1,
          status: DocumentStatus.VERIFIED,
          expiryDate: new Date('2099-01-01'),
        },
      ]);

      const res = await service.getChecklist(jobId);

      expect(res.isComplete).toBe(true);
      expect(res.missing).toHaveLength(0);
    });
  });

  describe('expireOutdatedDocuments', () => {
    it('delegates to repository and returns expired count', async () => {
      mockRepo.expireOutdatedDocuments.mockResolvedValue({ count: 5 });

      const res = await service.expireOutdatedDocuments();

      expect(res.count).toBe(5);
      expect(mockRepo.expireOutdatedDocuments).toHaveBeenCalled();
    });
  });
});

