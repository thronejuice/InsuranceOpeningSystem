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
import { validateFile } from './domain/file-validator.js';
import { DocumentRepository } from './document.repository.js';
import type { DocumentChecklistResponse, DocumentResponse, UploadDocumentDto } from './dto/document.dto.js';

function toResponse(doc: {
  id: string; jobId: string; documentType: string; originalName: string;
  mimeType: string; size: number; version: number; status: string;
  uploadedById: string | null; createdAt: Date; updatedAt: Date;
}): DocumentResponse {
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

  private get db() { return this.txHost.tx; }

  private async resolveJob(jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { id: true, agentId: true, productId: true },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private assertViewScope(agentId: string) {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && agentId !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }
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
      uploadedBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'UPLOAD_DOCUMENT',
      entityType: 'DOCUMENT',
      entityId: doc.id,
      jobId,
      newValue: { documentType: dto.documentType, originalName: file.originalname },
    });

    return toResponse(doc);
  }

  async download(documentId: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const doc = await this.repo.findById(documentId);
    if (!doc || doc.status === 'DELETED') throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const job = await this.resolveJob(doc.jobId);
    this.assertViewScope(job.agentId);

    const buffer = await this.storage.read(doc.storagePath);
    return { buffer, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  @Transactional()
  async remove(documentId: string): Promise<void> {
    const doc = await this.repo.findById(documentId);
    if (!doc || doc.status === 'DELETED') throw new BusinessException('DOCUMENT_NOT_FOUND', 'Document not found', 404);

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
    const uploaded = await this.repo.findByJobId(jobId);

    const uploadedByType = new Map<string, { id: string; originalName: string }>();
    for (const d of uploaded) {
      if (!uploadedByType.has(d.documentType)) {
        uploadedByType.set(d.documentType, { id: d.id, originalName: d.originalName });
      }
    }

    const required = checklist.map((c) => ({ documentType: c.documentType, isRequired: c.isRequired }));
    const uploadedList = uploaded.map((d) => ({
      documentType: d.documentType,
      documentId: d.id,
      originalName: d.originalName,
    }));
    const missing = checklist
      .filter((c) => c.isRequired && !uploadedByType.has(c.documentType))
      .map((c) => c.documentType as string);

    return { required, uploaded: uploadedList, missing };
  }

  async checkDocumentsComplete(jobId: string): Promise<string[]> {
    const job = await this.db.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { productId: true },
    });
    if (!job) return [];

    const checklist = await this.repo.getChecklist(job.productId);
    const uploaded = await this.repo.findByJobId(jobId);
    const uploadedTypes = new Set(uploaded.map((d) => d.documentType));

    return checklist
      .filter((c) => c.isRequired && !uploadedTypes.has(c.documentType as never))
      .map((c) => c.documentType as string);
  }
}
