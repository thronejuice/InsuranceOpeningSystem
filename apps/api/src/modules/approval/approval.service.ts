import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import type { JobStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { ApprovalRepository } from './approval.repository.js';
import type { ApproveApprovalDto } from './dto/approve-approval.dto.js';
import type { RejectApprovalDto } from './dto/reject-approval.dto.js';
import type { ListApprovalDto } from './dto/list-approval.dto.js';
import { toApprovalResponse, type ApprovalResponse } from './dto/approval.response.js';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly repo: ApprovalRepository,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async getInbox(dto: ListApprovalDto): Promise<ApprovalResponse[]> {
    const items = await this.repo.findInbox({ status: dto.status ?? 'PENDING' });
    return items.map(toApprovalResponse);
  }

  @Transactional()
  async approve(id: string, dto: ApproveApprovalDto): Promise<ApprovalResponse> {
    const userId = this.cls.get('userId')!;
    const approval = await this.repo.findById(id);
    if (!approval) throw new BusinessException('APPROVAL_NOT_FOUND', 'Approval not found', 404);

    if (approval.status !== 'PENDING') {
      throw new BusinessException('APPROVAL_INVALID_STATUS', `Cannot approve in status ${approval.status}`, 409);
    }

    // Prevent self-approval
    if (approval.requestedById === userId) {
      throw new BusinessException('APPROVAL_SELF_APPROVE', 'Cannot approve your own request', 422);
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
    await this.transitionJob(approval.jobId, job.status, job.version, 'APPROVED', userId);

    await this.audit.log({ action: 'APPROVE', entityType: 'APPROVAL', entityId: id, jobId: approval.jobId });

    return toApprovalResponse(updated);
  }

  @Transactional()
  async reject(id: string, dto: RejectApprovalDto): Promise<ApprovalResponse> {
    const userId = this.cls.get('userId')!;
    const approval = await this.repo.findById(id);
    if (!approval) throw new BusinessException('APPROVAL_NOT_FOUND', 'Approval not found', 404);

    if (approval.status !== 'PENDING') {
      throw new BusinessException('APPROVAL_INVALID_STATUS', `Cannot reject in status ${approval.status}`, 409);
    }

    // Prevent self-rejection
    if (approval.requestedById === userId) {
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

    return toApprovalResponse(updated);
  }

  private async transitionJob(jobId: string, fromStatus: string, version: number, toStatus: JobStatus, userId: string) {
    const { count } = await this.txHost.tx.job.updateMany({
      where: { id: jobId, version },
      data: { status: toStatus, version: { increment: 1 }, updatedById: userId },
    });
    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);
    }
    await this.txHost.tx.jobStatusHistory.create({
      data: { jobId, fromStatus: fromStatus as JobStatus, toStatus, changedById: userId },
    });
  }
}
