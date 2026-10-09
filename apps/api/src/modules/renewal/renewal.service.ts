import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { RenewalRepository } from './renewal.repository.js';
import type { RenewalQueryDto } from './dto/renewal-query.dto.js';
import { toRenewalResponse, type RenewalReferenceResponse, type RenewalResponse } from './dto/renewal.response.js';
import type { RenewPolicyDto } from './dto/renew-policy.dto.js';
import {
  canRenew,
  computeDefaultRenewalDates,
  RENEWAL_COPY_DOCUMENT_TYPES,
  validateRenewalDates,
} from './domain/renewal-dates.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { JobWorkflowService } from '../job/job-workflow.service.js';

const RENEWAL_THRESHOLDS_DAYS = [90, 60, 30, 7];

@Injectable()
export class RenewalService {
  constructor(
    private readonly repo: RenewalRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly workflow: JobWorkflowService,
  ) {}

  async list(query: RenewalQueryDto): Promise<{ items: RenewalResponse[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.RenewalWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.assignedTo && { assignedTo: query.assignedTo }),
      previousPolicy: {
        job: {
          deletedAt: null,
          ...this.scope.jobViewScope(),
        },
      },
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(where, skip, perPage),
      this.repo.count(where),
    ]);
    return { items: items.map(toRenewalResponse), total };
  }

  /** Previous-policy summary shown on a renewal job (null when the job is not a renewal). */
  async getReference(jobId: string): Promise<RenewalReferenceResponse | null> {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
      select: { previousPolicyId: true },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    if (!job.previousPolicyId) return null;

    const policy = await this.txHost.tx.policy.findUnique({
      where: { id: job.previousPolicyId },
      include: { insuranceCompany: { select: { name: true } }, job: { select: { id: true, jobNo: true } } },
    });
    if (!policy) return null;
    return {
      previousPolicyId: policy.id,
      previousPolicyNo: policy.policyNo,
      previousJobId: policy.job.id,
      previousJobNo: policy.job.jobNo,
      insuranceCompanyName: policy.insuranceCompany.name,
      totalPremium: policy.totalPremium.toFixed(2),
      effectiveDate: policy.effectiveDate.toISOString().slice(0, 10),
      expiryDate: policy.expiryDate ? policy.expiryDate.toISOString().slice(0, 10) : null,
    };
  }

  /**
   * Called by POST /policies/:policyId/renew
   * Copies the original job's customer/product/risk/coverage/assignee/customer documents into a new
   * DRAFT Job, links it via previousPolicyId (BR-013), transitions the old job → RENEWAL and closes
   * the old job's open RENEWAL tasks.
   */
  @Transactional()
  async renewPolicy(policyId: string, dto: RenewPolicyDto = {}): Promise<RenewalResponse> {
    const userId = this.cls.get('userId')!;
    const db = this.txHost.tx;

    const policy = await db.policy.findFirst({
      where: {
        id: policyId,
        job: { deletedAt: null, ...this.scope.jobViewScope() },
      },
      include: {
        job: {
          include: {
            risk: { include: { values: true } },
            coverages: true,
            documents: { where: { deletedAt: null, status: { notIn: ['REJECTED', 'EXPIRED'] }, documentType: { in: [...RENEWAL_COPY_DOCUMENT_TYPES] } } },
          },
        },
      },
    });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    const renewableStatuses = ['ACTIVE', 'EXPIRING', 'EXPIRED', 'ISSUED'];
    if (!renewableStatuses.includes(policy.status)) {
      throw new BusinessException('POLICY_NOT_ISSUED', 'Can only renew an active or expiring/expired policy', 422);
    }

    const originalJob = policy.job;
    if (!this.scope.canUpdateJob(originalJob.agentId)) {
      throw new BusinessException('FORBIDDEN', 'You cannot renew this policy', 403);
    }

    // Check BR-013 idempotency: prevent duplicate renewal job
    const existingRenewal = await this.repo.findActiveByPolicyId(policyId);
    if (existingRenewal?.newJobId) {
      throw new BusinessException('RENEWAL_ALREADY_EXISTS', 'An active renewal already exists for this policy', 409);
    }
    if (existingRenewal && !canRenew(existingRenewal)) {
      throw new BusinessException('RENEWAL_NOT_RENEWABLE', `Renewal in status ${existingRenewal.status} cannot be renewed`, 422);
    }

    const defaults = computeDefaultRenewalDates(originalJob);
    const dates = {
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : defaults.effectiveDate,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : defaults.expiryDate,
    };
    const dateError = validateRenewalDates(dates);
    if (dateError) throw new BusinessException('RENEWAL_INVALID_DATES', dateError, 422);

    const jobNo = await this.sequence.next('JOB');
    const newJob = await db.job.create({
      data: {
        jobNo,
        customer: { connect: { id: originalJob.customerId } },
        insuranceType: { connect: { id: originalJob.insuranceTypeId } },
        product: { connect: { id: originalJob.productId } },
        agent: { connect: { id: originalJob.agentId } },
        ...(originalJob.assignedTo && { assignee: { connect: { id: originalJob.assignedTo } } }),
        effectiveDate: dates.effectiveDate,
        expiryDate: dates.expiryDate,
        priority: originalJob.priority,
        source: 'RENEWAL',
        previousPolicyId: policyId,
        createdById: userId,
        updatedById: userId,
        coverages: originalJob.coverages.length > 0
          ? {
              create: originalJob.coverages.map((c) => ({
                coverageId: c.coverageId,
                sumInsured: c.sumInsured,
                deductible: c.deductible,
              })),
            }
          : undefined,
        ...(originalJob.risk && {
          risk: {
            create: {
              values: {
                create: originalJob.risk.values.map((v) => ({
                  fieldCode: v.fieldCode,
                  fieldValue: v.fieldValue,
                })),
              },
            },
          },
        }),
        // New rows pointing at the same stored files (files are not duplicated)
        ...(originalJob.documents.length > 0 && {
          documents: {
            create: originalJob.documents.map((d) => ({
              documentType: d.documentType,
              originalName: d.originalName,
              storedName: d.storedName,
              mimeType: d.mimeType,
              size: d.size,
              storagePath: d.storagePath,
              uploadedById: d.uploadedById,
            })),
          },
        }),
      },
    });

    // D-19: Renewal starts from Policy. The original Job remains CLOSED (not transitioned to RENEWAL).
    // The renewal has now been acted on: close its open RENEWAL tasks (other task types untouched)
    const closed = await db.task.updateMany({
      where: { jobId: originalJob.id, taskType: 'RENEWAL', status: { in: ['TODO', 'IN_PROGRESS'] } },
      data: { status: 'DONE', completedAt: new Date(), completedById: userId },
    });

    // Create or update Renewal record
    const renewal = existingRenewal
      ? await this.repo.update(existingRenewal.id, {
          newJob: { connect: { id: newJob.id } },
          status: 'IN_PROGRESS',
        })
      : await this.repo.create({
          previousPolicy: { connect: { id: policyId } },
          newJob: { connect: { id: newJob.id } },
          renewalDate: new Date(),
          targetExpiryDate: dates.expiryDate,
          status: 'IN_PROGRESS',
          assignee: { connect: { id: userId } },
        });

    await this.audit.log({
      action: 'RENEW_POLICY',
      entityType: 'RENEWAL',
      entityId: renewal.id,
      jobId: newJob.id,
      newValue: {
        previousPolicyId: policyId,
        newJobId: newJob.id,
        effectiveDate: dates.effectiveDate.toISOString().slice(0, 10),
        expiryDate: dates.expiryDate.toISOString().slice(0, 10),
        copiedDocuments: originalJob.documents.length,
        closedRenewalTasks: closed.count,
      },
    });

    return toRenewalResponse(renewal);
  }

  /**
   * Called by the BullMQ daily scheduler.
   * Creates Renewal records + tasks for policies expiring within threshold windows.
   * Idempotent: skips policies that already have an active (non-CANCELLED/LOST/RENEWED) renewal.
   */
  @Transactional()
  async runDailyRenewalCheck(): Promise<void> {
    const db = this.txHost.tx;
    const now = new Date();

    for (const days of RENEWAL_THRESHOLDS_DAYS) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const policies = await this.repo.findPoliciesExpiring(startOfDay, endOfDay);

      for (const policy of policies) {
        const existing = await this.repo.findActiveByPolicyId(policy.id);
        if (existing) continue;

        const renewal = await this.repo.create({
          previousPolicy: { connect: { id: policy.id } },
          renewalDate: now,
          targetExpiryDate: policy.expiryDate ?? now,
          status: 'PENDING',
          assignee: policy.job?.assignedTo
            ? { connect: { id: policy.job.assignedTo } }
            : undefined,
        });

        if (policy.jobId) {
          await db.task.create({
            data: {
              job: { connect: { id: policy.jobId } },
              taskType: 'RENEWAL',
              subject: `ต่ออายุกรมธรรม์ ${policy.policyNo} ครบกำหนดใน ${days} วัน`,
              dueDate: policy.expiryDate ?? now,
              priority: days <= 7 ? 'URGENT' : days <= 30 ? 'HIGH' : 'MEDIUM',
              status: 'TODO',
              assignee: policy.job?.assignedTo
                ? { connect: { id: policy.job.assignedTo } }
                : undefined,
            },
          });
        }

        void renewal;
      }
    }
  }
}
