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
import type { JobStatus } from '../../generated/prisma/enums.js';
import { RenewalRepository } from './renewal.repository.js';
import type { RenewalQueryDto } from './dto/renewal-query.dto.js';
import { toRenewalResponse, type RenewalResponse } from './dto/renewal.response.js';

const RENEWAL_THRESHOLDS_DAYS = [90, 60, 30, 7];

@Injectable()
export class RenewalService {
  constructor(
    private readonly repo: RenewalRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(query: RenewalQueryDto): Promise<{ items: RenewalResponse[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.RenewalWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.assignedTo && { assignedTo: query.assignedTo }),
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(where, skip, perPage),
      this.repo.count(where),
    ]);
    return { items: items.map(toRenewalResponse), total };
  }

  /**
   * Called by POST /policies/:policyId/renew
   * Copies the original job's customer/product/risk/coverage into a new Job,
   * links it via previousPolicyId (BR-013), transitions the old job → RENEWAL.
   */
  @Transactional()
  async renewPolicy(policyId: string): Promise<RenewalResponse> {
    const userId = this.cls.get('userId')!;
    const db = this.txHost.tx;

    const policy = await db.policy.findFirst({
      where: { id: policyId },
      include: {
        job: {
          include: {
            risk: { include: { values: true } },
            coverages: true,
          },
        },
        coverages: true,
      },
    });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    if (policy.status !== 'ISSUED') {
      throw new BusinessException('POLICY_NOT_ISSUED', 'Can only renew an issued policy', 422);
    }

    // Check BR-013 idempotency: prevent duplicate renewal job
    const existingRenewal = await this.repo.findActiveByPolicyId(policyId);
    if (existingRenewal?.newJobId) {
      throw new BusinessException('RENEWAL_ALREADY_EXISTS', 'An active renewal already exists for this policy', 409);
    }

    const originalJob = policy.job;
    const jobNo = await this.sequence.next('JOB');

    // Compute new effective/expiry dates (same duration, starting from old expiry)
    const oldExpiry = originalJob.expiryDate ?? new Date();
    const oldEffective = originalJob.effectiveDate;
    const durationMs = oldExpiry.getTime() - oldEffective.getTime();
    const newEffective = new Date(oldExpiry);
    const newExpiry = new Date(newEffective.getTime() + durationMs);

    const newJob = await db.job.create({
      data: {
        jobNo,
        customer: { connect: { id: originalJob.customerId } },
        insuranceType: { connect: { id: originalJob.insuranceTypeId } },
        product: { connect: { id: originalJob.productId } },
        agent: { connect: { id: originalJob.agentId } },
        effectiveDate: newEffective,
        expiryDate: newExpiry,
        priority: originalJob.priority,
        source: 'RENEWAL',
        previousPolicyId: policyId,
        createdById: userId,
        updatedById: userId,
        // copy coverages
        coverages: originalJob.coverages.length > 0
          ? {
              create: originalJob.coverages.map((c) => ({
                coverageId: c.coverageId,
                sumInsured: c.sumInsured,
                deductible: c.deductible,
              })),
            }
          : undefined,
        // copy risk
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
      },
    });

    // Transition old job → RENEWAL
    await this.transitionJob(originalJob.id, originalJob.status as JobStatus, originalJob.version, 'RENEWAL', userId);

    // Create or update Renewal record
    let renewal = existingRenewal;
    if (renewal) {
      renewal = await this.repo.update(renewal.id, {
        newJob: { connect: { id: newJob.id } },
        status: 'IN_PROGRESS',
      });
    } else {
      renewal = await this.repo.create({
        previousPolicy: { connect: { id: policyId } },
        newJob: { connect: { id: newJob.id } },
        renewalDate: new Date(),
        targetExpiryDate: newExpiry,
        status: 'IN_PROGRESS',
        assignee: { connect: { id: userId } },
      });
    }

    await this.audit.log({
      action: 'RENEW_POLICY',
      entityType: 'RENEWAL',
      entityId: renewal.id,
      jobId: newJob.id,
      newValue: { previousPolicyId: policyId, newJobId: newJob.id },
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

      const policies = await db.policy.findMany({
        where: {
          status: 'ISSUED',
          expiryDate: { gte: startOfDay, lte: endOfDay },
        },
        include: { job: { select: { assignedTo: true, agentId: true } } },
      });

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

  private async transitionJob(jobId: string, fromStatus: JobStatus, version: number, toStatus: JobStatus, userId: string) {
    const { count } = await this.txHost.tx.job.updateMany({
      where: { id: jobId, version },
      data: { status: toStatus, version: { increment: 1 }, updatedById: userId },
    });
    if (count === 0) {
      throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);
    }
    await this.txHost.tx.jobStatusHistory.create({
      data: { jobId, fromStatus, toStatus, changedById: userId },
    });
  }
}
