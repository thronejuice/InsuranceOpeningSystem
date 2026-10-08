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

@Injectable()
export class ApprovalService {
  constructor(
    private readonly repo: ApprovalRepository,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly workflow: JobWorkflowService,
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

    // Prevent self-rejection
    if (isSelfDecisionBlocked(approval.requestedById, viewer)) {
      throw new BusinessException('APPROVAL_SELF_APPROVE', 'Cannot reject your own request', 422);
    }

    const updated = await this.repo.update(id, {
      status: 'REJECTED',
      approver: userId ? { connect: { id: userId } } : undefined,
      reason: dto.reason,
      rejectedAt: new Date(),
    });

    // Q4: job stays at WAITING_APPROVAL — no status transition on rejection
    await this.audit.log({
      action: 'REJECT_APPROVAL',
      entityType: 'APPROVAL',
      entityId: id,
      jobId: approval.jobId,
      description: dto.reason,
    });

    return toApprovalResponse(updated, viewer);
  }
}
