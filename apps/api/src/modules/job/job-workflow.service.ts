import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { JobRepository } from './job.repository.js';
import { canTransition, type JobStatus } from './domain/job-status.js';
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
    const { count } = await this.txHost.tx.job.updateMany({
      where: { id: job.id, version: job.version, status: job.status },
      data: { status: to, version: { increment: 1 }, updatedById: userId },
    });

    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);
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

    await this.audit.log({
      action: 'STATUS_CHANGED',
      entityType: 'JOB',
      entityId: job.id,
      jobId: job.id,
      oldValue: { status: from },
      newValue: { status: to },
      description: opts.reason,
    });

    if (to === 'QUOTATION_REQUESTED') {
      await this.taskSvc.createAutoTask(job.id, 'FOLLOW_UP_QUOTATION', 'ติดตามใบเสนอราคา', job.agentId);
    } else if (to === 'PROPOSAL_SENT') {
      await this.taskSvc.createAutoTask(job.id, 'FOLLOW_UP_CUSTOMER', 'ติดตามผลการนำเสนอลูกค้า', job.agentId);
    }

    const updated = await this.repo.findById(jobId);
    const permissions = this.cls.get('permissions') ?? [];
    return toJobResponse(updated!, permissions, this.scope.canUpdateJob(updated!.agentId));
  }

  async getActivities(jobId: string) {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);

    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.view_all') && job.agentId !== userId && job.assignedTo !== userId) {
      throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    }

    const { histories, logs } = await this.repo.findActivities(jobId);

    type ActivityItem = { type: 'STATUS_CHANGE' | 'ACTIVITY'; occurredAt: string; data: unknown };
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
    ];

    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { jobId, items };
  }
}
