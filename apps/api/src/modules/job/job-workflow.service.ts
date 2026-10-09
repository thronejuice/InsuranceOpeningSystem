import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { JobRepository } from './job.repository.js';
import { canTransition, CANCEL_REQUIRES_APPROVAL_STATUSES, type JobStatus } from './domain/job-status.js';
import { toJobResponse, type JobResponse } from './dto/job.response.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { JobRiskService } from './job-risk.service.js';
import { DocumentService } from '../document/document.service.js';
import { TaskService } from '../task/task.service.js';

@Injectable()
export class JobWorkflowService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly repo: JobRepository,
    private readonly audit: AuditService,
    private readonly scope: DataScopeService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly riskSvc: JobRiskService,
    private readonly docSvc: DocumentService,
    private readonly taskSvc: TaskService,
  ) {}

  @Transactional()
  async transition(jobId: string, to: JobStatus, opts: { reason?: string } = {}): Promise<JobResponse> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const from = job.status as JobStatus;
    if (!canTransition(from, to)) {
      throw new BusinessException('JOB_INVALID_TRANSITION', `Cannot transition from ${from} to ${to}`, 409);
    }

    if (to === 'CANCELLED') {
      if (CANCEL_REQUIRES_APPROVAL_STATUSES.includes(from)) {
        throw new BusinessException(
          'JOB_CANCEL_REQUIRES_APPROVAL',
          `Cannot cancel directly while in ${from}. Submit a cancellation request for manager approval.`,
          409,
        );
      }
    }

    // submit (DRAFT→OPEN): check risk fields + optional document check
    if (from === 'DRAFT' && to === 'OPEN') {
      const missingRisk = await this.riskSvc.checkRiskComplete(jobId);
      if (missingRisk.length > 0) {
        const errMap = Object.fromEntries(missingRisk.map((f) => [f, [`${f} is required`]]));
        throw new BusinessException('JOB_RISK_INCOMPLETE', 'Required risk fields are missing', 422, errMap);
      }

      // Check documents if product requires them on submit
      const product = await this.txHost.tx.insuranceProduct.findFirst({
        where: { id: job.productId },
        select: { requireDocsOnSubmit: true },
      });
      if (product?.requireDocsOnSubmit) {
        const missingDocs = await this.docSvc.checkDocumentsComplete(jobId);
        if (missingDocs.length > 0) {
          const errMap = Object.fromEntries(missingDocs.map((t) => [t, [`${t} document is required`]]));
          throw new BusinessException('JOB_DOCUMENTS_MISSING', 'Required documents are missing', 422, errMap);
        }
      }
    }

    const userId = this.cls.get('userId')!;
    await this.transitionInTx(job, to, userId, opts);

    if (to === 'QUOTATION_REQUESTED') {
      await this.taskSvc.createAutoTask(job.id, 'FOLLOW_UP_QUOTATION', 'ติดตามใบเสนอราคา', job.agentId);
    } else if (to === 'PROPOSAL_SENT') {
      await this.taskSvc.createAutoTask(job.id, 'FOLLOW_UP_CUSTOMER', 'ติดตามผลการนำเสนอลูกค้า', job.agentId);
    }

    const updated = await this.repo.findById(jobId);
    const permissions = this.cls.get('permissions') ?? [];
    return toJobResponse(updated!, permissions, this.scope.canUpdateJob(updated!.agentId));
  }

  @Transactional()
  async requestCancel(jobId: string, opts: { reason: string }): Promise<JobResponse> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    if (!this.scope.canUpdateJob(job.agentId)) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const status = job.status as JobStatus;
    if (!CANCEL_REQUIRES_APPROVAL_STATUSES.includes(status)) {
      throw new BusinessException(
        'INVALID_CANCEL_REQUEST',
        `Job in status ${status} does not require manager approval to cancel. Use direct cancel.`,
        409,
      );
    }

    const userId = this.cls.get('userId')!;
    await this.txHost.tx.job.update({
      where: { id: jobId },
      data: {
        cancelRequestedAt: new Date(),
        cancelRequestedById: userId,
        cancelRequestReason: opts.reason,
      },
    });

    await this.audit.log({
      action: 'REQUEST_CANCEL',
      entityType: 'JOB',
      entityId: jobId,
      jobId,
      description: opts.reason,
    });

    const updated = await this.repo.findById(jobId);
    const permissions = this.cls.get('permissions') ?? [];
    return toJobResponse(updated!, permissions, this.scope.canUpdateJob(updated!.agentId));
  }

  @Transactional()
  async approveCancel(jobId: string, opts: { reason?: string } = {}): Promise<JobResponse> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.cancel')) {
      throw new BusinessException('FORBIDDEN', 'Access denied: job.cancel required to approve cancellation', 403);
    }

    const status = job.status as JobStatus;
    if (!CANCEL_REQUIRES_APPROVAL_STATUSES.includes(status)) {
      throw new BusinessException(
        'INVALID_CANCEL_APPROVAL',
        `Job in status ${status} is not pending cancel approval`,
        409,
      );
    }

    if (!job.cancelRequestedAt) {
      throw new BusinessException(
        'NO_PENDING_CANCEL_REQUEST',
        'No pending cancel request found for this job',
        409,
      );
    }

    const userId = this.cls.get('userId')!;
    if (job.cancelRequestedById === userId) {
      throw new BusinessException('CANCEL_SELF_APPROVE', 'Cannot approve your own cancel request', 422);
    }

    const cancellationReason = opts.reason || job.cancelRequestReason || 'Approved cancellation';

    await this.transitionInTx(job, 'CANCELLED', userId, { reason: cancellationReason });

    const updated = await this.repo.findById(jobId);
    return toJobResponse(updated!, permissions, this.scope.canUpdateJob(updated!.agentId));
  }

  @Transactional()
  async rejectCancel(jobId: string, opts: { reason: string }): Promise<JobResponse> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.cancel')) {
      throw new BusinessException('FORBIDDEN', 'Access denied: job.cancel required to reject cancellation request', 403);
    }

    if (!job.cancelRequestedAt) {
      throw new BusinessException(
        'NO_PENDING_CANCEL_REQUEST',
        'No pending cancel request found for this job',
        409,
      );
    }

    await this.txHost.tx.job.update({
      where: { id: jobId },
      data: {
        cancelRequestedAt: null,
        cancelRequestedById: null,
        cancelRequestReason: null,
      },
    });

    await this.audit.log({
      action: 'REJECT_CANCEL',
      entityType: 'JOB',
      entityId: jobId,
      jobId,
      description: opts.reason,
    });

    const updated = await this.repo.findById(jobId);
    return toJobResponse(updated!, permissions, this.scope.canUpdateJob(updated!.agentId));
  }

  @Transactional()
  async revise(jobId: string, opts: { reason?: string } = {}): Promise<JobResponse> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    if (job.status !== 'WAITING_CUSTOMER' && job.status !== 'APPROVAL_REJECTED') {
      throw new BusinessException(
        'JOB_INVALID_STATUS',
        `Cannot revise job in status ${job.status}. Must be in WAITING_CUSTOMER or APPROVAL_REJECTED.`,
        409,
      );
    }

    return this.transition(jobId, 'QUOTATION_RECEIVED', opts);
  }

  /**
   * Internal transition executed within an existing transaction by other domain services
   * (Quotation, Proposal, Approval, Policy, Renewal).
   * Validates state machine rules via canTransition(), performs optimistic locking on Job,
   * creates JobStatusHistory, and writes an audit log.
   */
  async transitionInTx(
    job: { id: string; status: string; version: number },
    to: JobStatus,
    userId: string,
    opts: { reason?: string } = {},
  ): Promise<void> {
    const from = job.status as JobStatus;
    if (!canTransition(from, to)) {
      throw new BusinessException('JOB_INVALID_TRANSITION', `Cannot transition from ${from} to ${to}`, 409);
    }

    if (to === 'QUOTATION_REQUESTED') {
      const jobRecord = await this.txHost.tx.job.findFirst({
        where: { id: job.id },
        select: { productId: true, product: { select: { requireUnderwriting: true } } },
      });
      if (jobRecord?.product?.requireUnderwriting) {
        const latestUw = await this.txHost.tx.underwriting.findFirst({
          where: { jobId: job.id, deletedAt: null },
          orderBy: { version: 'desc' },
        });
        if (!latestUw || latestUw.status !== 'APPROVED') {
          throw new BusinessException(
            'UNDERWRITING_REQUIRED',
            'Underwriting approval is required before requesting quotation',
            422,
          );
        }
      }
    }

    const isCancelling = to === 'CANCELLED';
    const { count } = await this.txHost.tx.job.updateMany({
      where: { id: job.id, version: job.version, status: job.status as JobStatus },
      data: {
        status: to,
        version: { increment: 1 },
        updatedById: userId,
        ...(to === 'QUOTATION_RECEIVED' ? { selectedQuotationId: null } : {}),
        ...(isCancelling
          ? {
              cancelledAt: new Date(),
              cancelledById: userId,
              cancellationReason: opts.reason,
            }
          : {}),
      },
    });

    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);
    }

    // If job is cancelled, mark active binding as CANCELLED (Day 19 / D-26)
    if (isCancelling && this.txHost.tx.binding?.updateMany) {
      await this.txHost.tx.binding.updateMany({
        where: {
          jobId: job.id,
          status: { in: ['PENDING', 'SUBMITTED', 'CONFIRMED'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
        },
      });
    }

    await this.txHost.tx.jobStatusHistory.create({
      data: {
        jobId: job.id,
        fromStatus: from,
        toStatus: to,
        reason: opts.reason,
        changedById: userId,
      },
    });

    // Revise action (WAITING_CUSTOMER / APPROVAL_REJECTED → QUOTATION_RECEIVED)
    if (to === 'QUOTATION_RECEIVED' && (from === 'WAITING_CUSTOMER' || from === 'APPROVAL_REJECTED')) {
      // 1. Current Proposal(s) -> SUPERSEDED
      if (this.txHost.tx.proposal?.updateMany) {
        await this.txHost.tx.proposal.updateMany({
          where: {
            jobId: job.id,
            status: { in: ['DRAFT', 'SENT', 'VIEWED', 'EXPIRED'] },
          },
          data: { status: 'SUPERSEDED' },
        });
      }

      // 2. Pending Approval(s) -> CANCELLED
      if (this.txHost.tx.approval?.updateMany) {
        await this.txHost.tx.approval.updateMany({
          where: {
            jobId: job.id,
            status: 'PENDING',
          },
          data: { status: 'CANCELLED' },
        });
      }

      // 3. Quotation SELECTED -> RECEIVED
      if (this.txHost.tx.quotation?.updateMany) {
        await this.txHost.tx.quotation.updateMany({
          where: {
            jobId: job.id,
            status: 'SELECTED',
          },
          data: { status: 'RECEIVED' },
        });
      }

      // 4. QuotationVersion SELECTED -> ACTIVE
      if (this.txHost.tx.quotationVersion?.updateMany) {
        await this.txHost.tx.quotationVersion.updateMany({
          where: {
            quotation: { jobId: job.id },
            status: 'SELECTED',
          },
          data: { status: 'ACTIVE' },
        });
      }
    }

    if (from === 'WAITING_INFORMATION' && to === 'OPEN') {
      const latestUw = await this.txHost.tx.underwriting.findFirst({
        where: { jobId: job.id, deletedAt: null },
        orderBy: { version: 'desc' },
      });
      if (latestUw && latestUw.status === 'INFO_REQUIRED') {
        await this.txHost.tx.underwriting.update({
          where: { id: latestUw.id },
          data: { status: 'PENDING', reviewedAt: null, underwriterId: null },
        });
      }
    }

    // D-5: ตอน Job CLOSED หรือ POLICY_ISSUED → quotation ที่ไม่ถูกเลือก → REJECTED
    if (to === 'CLOSED' || to === 'POLICY_ISSUED') {
      if (this.txHost.tx.quotation?.findMany && this.txHost.tx.quotation?.updateMany) {
        const unselectedQuotations = await this.txHost.tx.quotation.findMany({
          where: {
            jobId: job.id,
            status: { notIn: ['SELECTED', 'REJECTED', 'WITHDRAWN'] },
            deletedAt: null,
          },
          select: { id: true },
        });

        const unselectedIds = unselectedQuotations.map((q: { id: string }) => q.id);
        if (unselectedIds.length > 0) {
          await this.txHost.tx.quotation.updateMany({
            where: { id: { in: unselectedIds } },
            data: { status: 'REJECTED' },
          });

          if (this.txHost.tx.quotationVersion?.updateMany) {
            await this.txHost.tx.quotationVersion.updateMany({
              where: {
                quotationId: { in: unselectedIds },
                status: 'ACTIVE',
              },
              data: { status: 'REJECTED' },
            });
          }
        }
      }
    }

    await this.audit.log({
      action: 'STATUS_CHANGED',
      entityType: 'JOB',
      entityId: job.id,
      jobId: job.id,
      oldValue: { status: from },
      newValue: { status: to },
      description: opts.reason,
    });
  }

  async getActivities(jobId: string) {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (
      !permissions.includes('job.view_all') &&
      job.agentId !== userId &&
      job.assignedTo !== userId &&
      job.brokerStaffId !== userId
    ) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const { histories, logs, assignmentHistories } = await this.repo.findActivities(jobId);

    type ActivityItem = { type: 'STATUS_CHANGE' | 'ACTIVITY' | 'ASSIGNMENT'; occurredAt: string; data: unknown };
    const items: ActivityItem[] = [
      ...histories.map((h) => ({
        type: 'STATUS_CHANGE' as const,
        occurredAt: (h.changedAt as Date).toISOString(),
        data: {
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          reason: h.reason,
          changedById: h.changedById,
        },
      })),
      ...logs.map((l) => ({
        type: 'ACTIVITY' as const,
        occurredAt: (l.createdAt as Date).toISOString(),
        data: {
          action: l.action,
          entityType: l.entityType,
          description: l.description,
          userId: l.userId,
        },
      })),
      ...assignmentHistories.map((a) => ({
        type: 'ASSIGNMENT' as const,
        occurredAt: (a.changedAt as Date).toISOString(),
        data: {
          role: a.role,
          fromUser: a.fromUser,
          toUser: a.toUser,
          reason: a.reason,
          changedBy: a.changedBy,
        },
      })),
    ];

    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { jobId, items };
  }
}
