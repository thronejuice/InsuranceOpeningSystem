import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { validateFile } from './domain/file-validator.js';
import { isComplete, type ChecklistLevel } from './domain/document-checklist.js';
import { DocumentRepository } from './document.repository.js';
import type {
  DocumentChecklistResponse,
  DocumentResponse,
  RejectDocumentDto,
  UploadDocumentDto,
  VerifyDocumentDto,
} from './dto/document.dto.js';

interface DocRecordWithRelations {
  id: string;
  jobId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  version: number;
  status: DocumentStatus | string;
  uploadedById: string | null;
  uploadedBy?: { id: string; username: string; fullName: string } | null;
  verifiedById?: string | null;
  verifiedBy?: { id: string; username: string; fullName: string } | null;
  verifiedAt?: Date | null;
  expiryDate?: Date | null;
  remark?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(doc: DocRecordWithRelations): DocumentResponse {
  return {
    id: doc.id,
    jobId: doc.jobId,
    documentType: doc.documentType,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    version: doc.version,
    status: doc.status,
    uploadedById: doc.uploadedById,
    uploadedBy: doc.uploadedBy ? { id: doc.uploadedBy.id, username: doc.uploadedBy.username, fullName: doc.uploadedBy.fullName } : null,
    verifiedById: doc.verifiedById ?? null,
    verifiedBy: doc.verifiedBy ? { id: doc.verifiedBy.id, username: doc.verifiedBy.username, fullName: doc.verifiedBy.fullName } : null,
    verifiedAt: doc.verifiedAt ? doc.verifiedAt.toISOString() : null,
    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().slice(0, 10) : null,
    remark: doc.remark ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

@Injectable()
export class DocumentService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly repo: DocumentRepository,
    private readonly storage: StorageService,
    private readonly scope: DataScopeService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  private async resolveJob(jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
      select: { id: true, agentId: true, productId: true },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private assertViewScope(_agentId: string) {
    // Job view scope is already enforced by resolveJob
  }

  async list(jobId: string): Promise<DocumentResponse[]> {
    const job = await this.resolveJob(jobId);
    this.assertViewScope(job.agentId);
    const docs = await this.repo.findByJobId(jobId);
    return docs.map(toResponse);
  }

  @Transactional()
  async upload(
    jobId: string,
    dto: UploadDocumentDto,
    file: Express.Multer.File,
  ): Promise<DocumentResponse> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    // Validate file (ext + magic bytes + size)
    const validation = await validateFile(file.originalname, file.buffer);
    if (!validation.ok) {
      throw new BusinessException('INVALID_FILE', validation.reason, 422);
    }

    const userId = this.cls.get('userId')!;

    // Document version: upload ประเภทเดิมซ้ำบน Job เดียวกัน = version+1, version เก่าเก็บไว้ (ไม่ลบ)
    const latest = await this.repo.findLatestByJobAndType(jobId, dto.documentType);
    const nextVersion = latest ? latest.version + 1 : 1;

    const storedName = `${uuidv4()}.${validation.ext}`;
    const now = new Date();
    const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${jobId}/${storedName}`;

    // Save to storage
    await this.storage.save(storagePath, file.buffer);

    const doc = await this.repo.create({
      job: { connect: { id: jobId } },
      documentType: dto.documentType as never,
      originalName: file.originalname,
      storedName,
      mimeType: validation.mime,
      size: file.buffer.length,
      storagePath,
      version: nextVersion,
      status: DocumentStatus.UPLOADED,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      uploadedBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'UPLOAD_DOCUMENT',
      entityType: 'DOCUMENT',
      entityId: doc.id,
      jobId,
      newValue: {
        documentType: dto.documentType,
        originalName: file.originalname,
        version: nextVersion,
      },
    });

    return toResponse(doc);
  }

  @Transactional()
  async verify(id: string, dto: VerifyDocumentDto): Promise<DocumentResponse> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const job = await this.resolveJob(doc.jobId);
    this.assertViewScope(job.agentId);

    const currentUserId = this.cls.get('userId')!;

    // Maker-checker rule: ห้าม verify ของที่ตัวเอง upload (422)
    if (doc.uploadedById === currentUserId) {
      throw new BusinessException(
        'MAKER_CHECKER_VIOLATION',
        'Cannot verify a document you uploaded yourself',
        422,
      );
    }

    if (doc.status === DocumentStatus.EXPIRED) {
      throw new BusinessException('DOCUMENT_EXPIRED', 'Cannot verify an expired document', 422);
    }

    const updated = await this.repo.update(id, {
      status: DocumentStatus.VERIFIED,
      verifiedBy: { connect: { id: currentUserId } },
      verifiedAt: new Date(),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : doc.expiryDate,
      remark: dto.remark ?? doc.remark,
    });

    await this.audit.log({
      action: 'VERIFY_DOCUMENT',
      entityType: 'DOCUMENT',
      entityId: id,
      jobId: doc.jobId,
      oldValue: { status: doc.status },
      newValue: {
        status: DocumentStatus.VERIFIED,
        verifiedById: currentUserId,
        expiryDate: updated.expiryDate,
        remark: updated.remark,
      },
    });

    return toResponse(updated);
  }

  @Transactional()
  async reject(id: string, dto: RejectDocumentDto): Promise<DocumentResponse> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const job = await this.resolveJob(doc.jobId);
    this.assertViewScope(job.agentId);

    const currentUserId = this.cls.get('userId')!;

    // Maker-checker rule: ห้าม reject ของที่ตัวเอง upload (422)
    if (doc.uploadedById === currentUserId) {
      throw new BusinessException(
        'MAKER_CHECKER_VIOLATION',
        'Cannot reject a document you uploaded yourself',
        422,
      );
    }

    const updated = await this.repo.update(id, {
      status: DocumentStatus.REJECTED,
      verifiedBy: { connect: { id: currentUserId } },
      verifiedAt: new Date(),
      remark: dto.reason,
    });

    await this.audit.log({
      action: 'REJECT_DOCUMENT',
      entityType: 'DOCUMENT',
      entityId: id,
      jobId: doc.jobId,
      oldValue: { status: doc.status },
      newValue: {
        status: DocumentStatus.REJECTED,
        verifiedById: currentUserId,
        reason: dto.reason,
      },
    });

    return toResponse(updated);
  }

  async download(documentId: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const doc = await this.repo.findById(documentId);
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const job = await this.resolveJob(doc.jobId);
    this.assertViewScope(job.agentId);

    const buffer = await this.storage.read(doc.storagePath);
    return { buffer, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  @Transactional()
  async remove(documentId: string): Promise<void> {
    const doc = await this.repo.findById(documentId);
    if (!doc) throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const job = await this.resolveJob(doc.jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    await this.repo.softDelete(documentId);
    await this.audit.log({
      action: 'DELETE_DOCUMENT',
      entityType: 'DOCUMENT',
      entityId: documentId,
      jobId: doc.jobId,
    });
  }

  async getChecklist(jobId: string): Promise<DocumentChecklistResponse> {
    const job = await this.resolveJob(jobId);
    this.assertViewScope(job.agentId);

    const checklist = await this.repo.getChecklist(job.productId);
    const docs = await this.repo.findByJobId(jobId);

    const evalResult = isComplete(checklist, docs, 'UPLOADED');

    const required = checklist.map((c) => ({
      documentType: c.documentType as string,
      isRequired: c.isRequired,
    }));

    const uploaded = docs.map((d) => ({
      documentType: d.documentType as string,
      documentId: d.id,
      originalName: d.originalName,
      version: d.version,
      status: d.status as string,
      expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
    }));

    return {
      isComplete: evalResult.isComplete,
      required,
      uploaded,
      missing: evalResult.missing,
    };
  }

  async checkDocumentsComplete(
    jobId: string,
    level: ChecklistLevel = 'UPLOADED',
  ): Promise<string[]> {
    const job = await this.db.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { productId: true },
    });
    if (!job) return [];

    const checklist = await this.repo.getChecklist(job.productId);
    const docs = await this.repo.findByJobId(jobId);

    const result = isComplete(checklist, docs, level);
    return result.missing;
  }

  async expireOutdatedDocuments(now = new Date()): Promise<{ count: number }> {
    const res = await this.repo.expireOutdatedDocuments(now);
    return { count: res.count };
  }
}
