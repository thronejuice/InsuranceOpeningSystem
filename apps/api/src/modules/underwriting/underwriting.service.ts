import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotificationType, UnderwritingStatus } from '../../generated/prisma/enums.js';
import { NotificationService } from '../notification/notification.service.js';
import { DocumentService } from '../document/document.service.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';
import { UnderwritingRepository } from './underwriting.repository.js';
import type {
  RequestUnderwritingDto,
  ReviewUnderwritingDto,
  UnderwritingResponse,
} from './dto/underwriting.dto.js';

interface UnderwritingRecordWithRelations {
  id: string;
  jobId: string;
  version: number;
  status: UnderwritingStatus | string;
  riskLevel: string | null;
  riskScore: number | null;
  requestedById: string | null;
  requestedBy?: { id: string; username: string; fullName: string } | null;
  requestedAt: Date;
  underwriterId: string | null;
  underwriter?: { id: string; username: string; fullName: string } | null;
  reviewedAt: Date | null;
  reason: string | null;
  condition: string | null;
  exclusion: string | null;
  deductible: unknown;
  requiredSurvey: boolean;
  requiredDocuments: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(item: UnderwritingRecordWithRelations): UnderwritingResponse {
  return {
    id: item.id,
    jobId: item.jobId,
    version: item.version,
    status: item.status,
    riskLevel: item.riskLevel ?? null,
    riskScore: item.riskScore ?? null,
    requestedById: item.requestedById ?? null,
    requestedBy: item.requestedBy
      ? { id: item.requestedBy.id, username: item.requestedBy.username, fullName: item.requestedBy.fullName }
      : null,
    requestedAt: item.requestedAt.toISOString(),
    underwriterId: item.underwriterId ?? null,
    underwriter: item.underwriter
      ? { id: item.underwriter.id, username: item.underwriter.username, fullName: item.underwriter.fullName }
      : null,
    reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
    reason: item.reason ?? null,
    condition: item.condition ?? null,
    exclusion: item.exclusion ?? null,
    deductible: item.deductible != null ? String(item.deductible) : null,
    requiredSurvey: Boolean(item.requiredSurvey),
    requiredDocuments: Array.isArray(item.requiredDocuments) ? (item.requiredDocuments as string[]) : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

@Injectable()
export class UnderwritingService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly repo: UnderwritingRepository,
    private readonly scope: DataScopeService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly docSvc: DocumentService,
    private readonly workflow: JobWorkflowService,
    private readonly notifSvc: NotificationService,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  private async resolveJob(jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
      include: {
        product: { select: { id: true, code: true, name: true, requireUnderwriting: true } },
      },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  async getLatest(jobId: string): Promise<UnderwritingResponse | null> {
    await this.resolveJob(jobId);
    const item = await this.repo.findLatestByJobId(jobId);
    return item ? toResponse(item) : null;
  }

  async listHistory(jobId: string): Promise<UnderwritingResponse[]> {
    await this.resolveJob(jobId);
    const items = await this.repo.findByJobId(jobId);
    return items.map(toResponse);
  }

  async getInbox() {
    const items = await this.repo.findPendingInbox(this.scope.jobViewScope());
    return items.map((item) => ({
      ...toResponse(item),
      job: item.job,
    }));
  }

  @Transactional()
  async requestReview(jobId: string, dto?: RequestUnderwritingDto): Promise<UnderwritingResponse> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    if (job.status !== 'OPEN') {
      throw new BusinessException(
        'JOB_INVALID_STATE',
        `Job must be in OPEN status to request underwriting review (current: ${job.status})`,
        422,
      );
    }

    // Check that all required documents are VERIFIED
    const missingDocs = await this.docSvc.checkDocumentsComplete(jobId, 'VERIFIED');
    if (missingDocs.length > 0) {
      const errMap = Object.fromEntries(missingDocs.map((t) => [t, [`${t} document must be VERIFIED`]]));
      throw new BusinessException(
        'DOCUMENTS_NOT_VERIFIED',
        'All required documents must be VERIFIED before requesting underwriting review',
        422,
        errMap,
      );
    }

    const latest = await this.repo.findLatestByJobId(jobId);
    if (latest && latest.status === UnderwritingStatus.PENDING) {
      throw new BusinessException('UNDERWRITING_ALREADY_PENDING', 'Underwriting review is already pending', 422);
    }

    const nextVersion = latest ? latest.version + 1 : 1;
    const userId = this.cls.get('userId')!;

    const created = await this.repo.create({
      job: { connect: { id: jobId } },
      version: nextVersion,
      status: UnderwritingStatus.PENDING,
      requestedBy: { connect: { id: userId } },
      reason: dto?.reason ?? null,
    });

    await this.audit.log({
      action: 'UNDERWRITING_REQUESTED',
      entityType: 'JOB',
      entityId: jobId,
      jobId,
      newValue: { underwritingId: created.id, version: nextVersion, status: UnderwritingStatus.PENDING },
      description: dto?.reason,
    });

    // Notify managers & underwriters if any
    const recipients = [job.brokerStaffId].filter(Boolean) as string[];
    if (recipients.length > 0) {
      await this.notifSvc.emit(NotificationType.UNDERWRITING_REQUESTED, recipients, {
        title: `มีคำขอตรวจ Underwriting สำหรับ Job ${job.jobNo}`,
        message: `Job ${job.jobNo} ได้รับการส่งเอกสารครบถ้วนและขอให้ตรวจพิจารณาความเสี่ยง (v${nextVersion})`,
        entityType: 'UNDERWRITING',
        entityId: created.id,
        jobId: job.id,
      });
    }

    return toResponse(created);
  }

  @Transactional()
  async review(jobId: string, dto: ReviewUnderwritingDto): Promise<UnderwritingResponse> {
    const job = await this.resolveJob(jobId);
    const latest = await this.repo.findLatestByJobId(jobId);
    if (!latest || latest.status !== UnderwritingStatus.PENDING) {
      throw new BusinessException('UNDERWRITING_NOT_PENDING', 'No pending underwriting review found for this job', 422);
    }

    const userId = this.cls.get('userId')!;

    // Maker-checker rule: cannot approve/review own request
    if (latest.requestedById && latest.requestedById === userId) {
      throw new BusinessException(
        'MAKER_CHECKER_VIOLATION',
        'ผู้ขอ Underwriting ไม่สามารถรีวิวอนุมัติหรือตัดสินใจเองได้ (Maker-Checker)',
        422,
      );
    }

    const reviewedAt = new Date();

    if (dto.status === UnderwritingStatus.REJECTED) {
      if (!dto.reason?.trim()) {
        throw new BusinessException('REASON_REQUIRED', 'Reason is required for underwriting rejection', 422);
      }

      const updated = await this.repo.update(latest.id, {
        status: UnderwritingStatus.REJECTED,
        underwriter: { connect: { id: userId } },
        reviewedAt,
        reason: dto.reason.trim(),
      });

      // reject → Job CLOSED
      await this.workflow.transitionInTx(job, 'CLOSED', userId, {
        reason: `Underwriting rejected: ${dto.reason.trim()}`,
      });

      await this.audit.log({
        action: 'UNDERWRITING_REJECTED',
        entityType: 'JOB',
        entityId: jobId,
        jobId,
        oldValue: { underwritingStatus: latest.status },
        newValue: { underwritingStatus: UnderwritingStatus.REJECTED, reason: dto.reason },
        description: dto.reason,
      });

      const recipients = [job.agentId, job.brokerStaffId].filter(Boolean) as string[];
      await this.notifSvc.emit(NotificationType.UNDERWRITING_REJECTED, recipients, {
        title: `Underwriting ของ Job ${job.jobNo} ถูกปฏิเสธ`,
        message: `ผลการพิจารณา: ปฏิเสธ (${dto.reason})`,
        entityType: 'UNDERWRITING',
        entityId: updated.id,
        jobId: job.id,
      });

      return toResponse(updated);
    }

    if (dto.status === UnderwritingStatus.INFO_REQUIRED) {
      if (!dto.reason?.trim()) {
        throw new BusinessException('REASON_REQUIRED', 'Reason is required when requesting more information', 422);
      }

      const updated = await this.repo.update(latest.id, {
        status: UnderwritingStatus.INFO_REQUIRED,
        underwriter: { connect: { id: userId } },
        reviewedAt,
        reason: dto.reason.trim(),
        condition: dto.condition ?? null,
        requiredDocuments: dto.requiredDocuments ?? undefined,
      });

      // requireInfo → Job WAITING_INFORMATION
      await this.workflow.transitionInTx(job, 'WAITING_INFORMATION', userId, {
        reason: `Underwriting requested info: ${dto.reason.trim()}`,
      });

      await this.audit.log({
        action: 'UNDERWRITING_INFO_REQUIRED',
        entityType: 'JOB',
        entityId: jobId,
        jobId,
        oldValue: { underwritingStatus: latest.status },
        newValue: { underwritingStatus: UnderwritingStatus.INFO_REQUIRED, reason: dto.reason },
        description: dto.reason,
      });

      const recipients = [job.agentId, job.brokerStaffId].filter(Boolean) as string[];
      await this.notifSvc.emit(NotificationType.UNDERWRITING_INFO_REQUIRED, recipients, {
        title: `Job ${job.jobNo} ต้องการข้อมูลเพิ่มเติมสำหรับการประเมินภัย`,
        message: `ผู้ประเมินภัยต้องการข้อมูลเพิ่มเติม: ${dto.reason}`,
        entityType: 'UNDERWRITING',
        entityId: updated.id,
        jobId: job.id,
      });

      return toResponse(updated);
    }

    if (dto.status === UnderwritingStatus.APPROVED) {
      if (!dto.riskLevel) {
        throw new BusinessException('RISK_LEVEL_REQUIRED', 'Risk level is required to approve underwriting', 422);
      }

      const updated = await this.repo.update(latest.id, {
        status: UnderwritingStatus.APPROVED,
        underwriter: { connect: { id: userId } },
        reviewedAt,
        riskLevel: dto.riskLevel ?? null,
        riskScore: dto.riskScore ?? null,
        reason: dto.reason ?? null,
        condition: dto.condition ?? null,
        exclusion: dto.exclusion ?? null,
        deductible: dto.deductible != null ? String(dto.deductible) : null,
        requiredSurvey: dto.requiredSurvey ?? false,
        requiredDocuments: dto.requiredDocuments ?? undefined,
      });

      await this.audit.log({
        action: 'UNDERWRITING_APPROVED',
        entityType: 'JOB',
        entityId: jobId,
        jobId,
        oldValue: { underwritingStatus: latest.status },
        newValue: { underwritingStatus: UnderwritingStatus.APPROVED, riskLevel: dto.riskLevel },
        description: dto.reason,
      });

      const recipients = [job.agentId, job.brokerStaffId].filter(Boolean) as string[];
      await this.notifSvc.emit(NotificationType.UNDERWRITING_APPROVED, recipients, {
        title: `Job ${job.jobNo} ผ่านการพิจารณา Underwriting เรียบร้อยแล้ว`,
        message: `Underwriting ได้รับการอนุมัติ (ระดับความเสี่ยง: ${dto.riskLevel ?? 'ปกติ'}) พร้อมดำเนินการขอใบเสนอราคา`,
        entityType: 'UNDERWRITING',
        entityId: updated.id,
        jobId: job.id,
      });

      return toResponse(updated);
    }

    throw new BusinessException('INVALID_STATUS', `Invalid underwriting review status: ${dto.status}`, 422);
  }

  @Transactional()
  async resume(jobId: string, reason?: string): Promise<UnderwritingResponse> {
    const job = await this.resolveJob(jobId);
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    if (job.status !== 'WAITING_INFORMATION') {
      throw new BusinessException(
        'JOB_NOT_WAITING_INFO',
        `Job is not waiting for information (current: ${job.status})`,
        422,
      );
    }

    const userId = this.cls.get('userId')!;

    // Transition Job back to OPEN
    await this.workflow.transitionInTx(job, 'OPEN', userId, {
      reason: reason ?? 'Resume underwriting review after updating information',
    });

    // resume ส่งกลับ PENDING
    const latest = await this.repo.findLatestByJobId(jobId);
    if (!latest) {
      throw new BusinessException('UNDERWRITING_NOT_FOUND', 'No underwriting record found', 404);
    }

    const updated = await this.repo.update(latest.id, {
      status: UnderwritingStatus.PENDING,
      reviewedAt: null,
      underwriter: { disconnect: true },
    });

    await this.audit.log({
      action: 'UNDERWRITING_RESUMED',
      entityType: 'JOB',
      entityId: jobId,
      jobId,
      oldValue: { underwritingStatus: latest.status },
      newValue: { underwritingStatus: UnderwritingStatus.PENDING },
      description: reason,
    });

    return toResponse(updated);
  }
}
