import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { ApprovalRepository } from './approval.repository.js';
import type { ApproveApprovalDto } from './dto/approve-approval.dto.js';
import type { RejectApprovalDto } from './dto/reject-approval.dto.js';
import type { ListApprovalDto } from './dto/list-approval.dto.js';
import { canApproveType, isSelfDecisionBlocked, type ApprovalViewer } from './domain/approval-rules.js';
import { toApprovalResponse, type ApprovalResponse } from './dto/approval.response.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';

import { NotificationService } from '../notification/notification.service.js';
import { NotificationType } from '../../generated/prisma/enums.js';
import type { ResubmitApprovalDto } from './dto/resubmit-approval.dto.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly repo: ApprovalRepository,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly workflow: JobWorkflowService,
    private readonly notifications: NotificationService,
    private readonly scope: DataScopeService,
  ) {}

  private viewer(): ApprovalViewer {
    return {
      userId: this.cls.get('userId'),
      permissions: this.cls.get('permissions') ?? [],
      roles: this.cls.get('roles') ?? [],
    };
  }

  async getInbox(dto: ListApprovalDto): Promise<ApprovalResponse[]> {
    const items = await this.repo.findInbox({ status: dto.status ?? 'PENDING' });
    const viewer = this.viewer();
    const visible = items.filter((a) => canApproveType(a.approvalType, viewer.roles ?? []));
    return visible.map((a) => toApprovalResponse(a, viewer));
  }

  @Transactional()
  async approve(id: string, dto: ApproveApprovalDto): Promise<ApprovalResponse> {
    const userId = this.cls.get('userId')!;
    const viewer = this.viewer();
    const approval = await this.repo.findById(id);
    if (!approval) throw new BusinessException('APPROVAL_NOT_FOUND', 'Approval not found', 404);

    if (approval.status !== 'PENDING') {
      throw new BusinessException('APPROVAL_INVALID_STATUS', `Cannot approve in status ${approval.status}`, 409);
    }

    // Prevent self-approval (maker-checker)
    if (isSelfDecisionBlocked(approval.requestedById, viewer)) {
      throw new BusinessException('APPROVAL_SELF_APPROVE', 'Cannot approve your own request', 422);
    }

    // Role check: approver must match or exceed the required approvalType level
    if (!canApproveType(approval.approvalType, viewer.roles ?? [])) {
      throw new BusinessException('FORBIDDEN', `Insufficient role level to approve ${approval.approvalType} request`, 403);
    }

    const updated = await this.repo.update(id, {
      status: 'APPROVED',
      approver: userId ? { connect: { id: userId } } : undefined,
      reason: dto.reason ?? null,
      approvedAt: new Date(),
    });

    // Transition job WAITING_APPROVAL → APPROVED
    const job = await this.txHost.tx.job.findFirst({ where: { id: approval.jobId, deletedAt: null } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    await this.workflow.transitionInTx(job, 'APPROVED', userId);

    await this.audit.log({ action: 'APPROVE', entityType: 'APPROVAL', entityId: id, jobId: approval.jobId });

    return toApprovalResponse(updated, viewer);
  }

  @Transactional()
  async reject(id: string, dto: RejectApprovalDto): Promise<ApprovalResponse> {
    const userId = this.cls.get('userId')!;
    const viewer = this.viewer();
    const approval = await this.repo.findById(id);
    if (!approval) throw new BusinessException('APPROVAL_NOT_FOUND', 'Approval not found', 404);

    if (approval.status !== 'PENDING') {
      throw new BusinessException('APPROVAL_INVALID_STATUS', `Cannot reject in status ${approval.status}`, 409);
    }

    // Prevent self-decision (maker-checker)
    if (isSelfDecisionBlocked(approval.requestedById, viewer)) {
      throw new BusinessException('APPROVAL_SELF_APPROVE', 'Cannot decide your own request', 422);
    }

    // Role check: rejecter must match or exceed the required approvalType level
    if (!canApproveType(approval.approvalType, viewer.roles ?? [])) {
      throw new BusinessException('FORBIDDEN', `Insufficient role level to decide ${approval.approvalType} request`, 403);
    }

    const rejectReasonText = dto.rejectReason ?? dto.reason;
    if (!rejectReasonText || !rejectReasonText.trim()) {
      throw new BusinessException('VALIDATION_ERROR', 'Reject reason is required', 422);
    }

    const updated = await this.repo.update(id, {
      status: 'REJECTED',
      approver: userId ? { connect: { id: userId } } : undefined,
      reason: rejectReasonText,
      rejectReason: rejectReasonText,
      comment: dto.comment ?? null,
      rejectedAt: new Date(),
    });

    // Transition job WAITING_APPROVAL → APPROVAL_REJECTED (Day 18 / D-7 / Replacing V1 Q4)
    const job = await this.txHost.tx.job.findFirst({ where: { id: approval.jobId, deletedAt: null } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    await this.workflow.transitionInTx(job, 'APPROVAL_REJECTED', userId, { reason: rejectReasonText });

    // Send APPROVAL_REJECTED notification to job owner/agent/staff
    const recipients = [job.createdById, job.agentId, job.brokerStaffId, job.assignedTo, approval.requestedById]
      .filter((uid): uid is string => Boolean(uid));
    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length > 0) {
      await this.notifications.emit(
        NotificationType.APPROVAL_REJECTED,
        uniqueRecipients,
        {
          title: `คำขออนุมัติสำหรับงาน ${job.jobNo} ถูกปฏิเสธ`,
          message: `คำขออนุมัติถูกปฏิเสธเนื่องจาก: ${rejectReasonText}${dto.comment ? ` (หมายเหตุ: ${dto.comment})` : ''}`,
          entityType: 'APPROVAL',
          entityId: id,
          jobId: job.id,
        },
      );
    }

    await this.audit.log({
      action: 'REJECT_APPROVAL',
      entityType: 'APPROVAL',
      entityId: id,
      jobId: approval.jobId,
      description: rejectReasonText,
    });

    return toApprovalResponse(updated, viewer);
  }

  @Transactional()
  async resubmit(id: string, dto: ResubmitApprovalDto): Promise<ApprovalResponse> {
    const userId = this.cls.get('userId')!;
    const viewer = this.viewer();
    const oldApproval = await this.repo.findById(id);
    if (!oldApproval) throw new BusinessException('APPROVAL_NOT_FOUND', 'Approval not found', 404);

    if (oldApproval.status !== 'REJECTED') {
      throw new BusinessException('APPROVAL_INVALID_STATUS', `Cannot resubmit approval in status ${oldApproval.status}. Must be REJECTED.`, 409);
    }

    const job = await this.txHost.tx.job.findFirst({ where: { id: oldApproval.jobId, deletedAt: null } });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    // resubmit is a maker action (the job owner re-submitting their own rejected request),
    // unlike approve/reject which are checker actions — so it must respect data scope (BR-014).
    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    if (job.status !== 'APPROVAL_REJECTED') {
      throw new BusinessException('JOB_INVALID_STATUS', `Cannot resubmit job in status ${job.status}. Must be in APPROVAL_REJECTED.`, 409);
    }

    // Link attachment files if provided
    if (dto.attachmentFileIds && dto.attachmentFileIds.length > 0) {
      const docs = await this.txHost.tx.document.findMany({
        where: { id: { in: dto.attachmentFileIds }, jobId: job.id, deletedAt: null },
      });
      if (docs.length !== dto.attachmentFileIds.length) {
        throw new BusinessException('DOCUMENT_NOT_FOUND', 'One or more attachment documents not found for this job', 404);
      }
    }

    // Mark old approval as resubmitted
    const now = new Date();
    await this.repo.update(id, {
      resubmittedAt: now,
      resubmittedBy: userId ? { connect: { id: userId } } : undefined,
    });

    // Create new Approval record with status PENDING
    const newApproval = await this.txHost.tx.approval.create({
      data: {
        job: { connect: { id: job.id } },
        proposal: { connect: { id: oldApproval.proposalId } },
        approvalType: oldApproval.approvalType,
        requestedBy: userId ? { connect: { id: userId } } : undefined,
        reason: dto.reason ?? oldApproval.reason,
        comment: dto.comment ?? null,
      },
      include: {
        job: { include: { customer: true } },
        proposal: { include: { quotation: true } },
      },
    });

    // Transition Job back to WAITING_APPROVAL
    await this.workflow.transitionInTx(job, 'WAITING_APPROVAL', userId, {
      reason: dto.reason ?? dto.comment ?? 'Resubmitted approval request',
    });

    // Send APPROVAL_REQUESTED notification to approvers
    const approverUsers = await this.txHost.tx.user.findMany({
      where: {
        roles: {
          some: {
            role: {
              code: { in: [oldApproval.approvalType, 'SUPERVISOR', 'MANAGER', 'ADMIN'] },
            },
          },
        },
        deletedAt: null,
      },
      select: { id: true },
    });
    const approverIds = approverUsers.map((u) => u.id);

    if (approverIds.length > 0) {
      await this.notifications.emit(
        NotificationType.APPROVAL_REQUESTED,
        approverIds,
        {
          title: `ยื่นขออนุมัติใหม่สำหรับงาน ${job.jobNo}`,
          message: `คำขออนุมัติสำหรับงาน ${job.jobNo} ถูกส่งใหม่อีกครั้ง (เหตุผล: ${dto.reason ?? 'ยื่นขอพิจารณาใหม่'})`,
          entityType: 'APPROVAL',
          entityId: newApproval.id,
          jobId: job.id,
        },
      );
    }

    await this.audit.log({
      action: 'RESUBMIT_APPROVAL',
      entityType: 'APPROVAL',
      entityId: newApproval.id,
      jobId: job.id,
      description: dto.reason,
    });

    return toApprovalResponse(newApproval, viewer);
  }
}
