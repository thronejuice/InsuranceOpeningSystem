import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CommissionStatus } from '../../generated/prisma/enums.js';
import { SystemSettingService } from '../system-setting/system-setting.service.js';
import { CommissionRepository } from './commission.repository.js';
import { computeCommissionBreakdown, CommissionShareError } from './domain/commission.js';
import type { CommissionQueryDto } from './dto/commission-query.dto.js';
import { toCommissionResponse, type CommissionListResponse, type CommissionResponse } from './dto/commission.response.js';

export type CalculationOutcome =
  | { outcome: 'CREATED' | 'EXISTS'; commissions: CommissionResponse[] }
  | { outcome: 'NO_RATE' }
  | { outcome: 'SHARE_EXCEEDS_100' };

@Injectable()
export class CommissionService {
  constructor(
    private readonly repo: CommissionRepository,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    private readonly settings: SystemSettingService,
  ) {}

  private async assertJobAccess(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    try {
      await this.assertJobAccess(policy.jobId);
    } catch {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    return policy;
  }

  async listByPolicy(policyId: string): Promise<CommissionListResponse> {
    await this.assertPolicyAccess(policyId);
    const commissions = await this.repo.findByPolicy(policyId);
    return { items: commissions.map(toCommissionResponse), total: commissions.length };
  }

  async list(query: CommissionQueryDto): Promise<CommissionListResponse> {
    const page = query.page ?? 1;
    const limit = query.perPage ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommissionWhereInput = {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.policyId ? { policyId: query.policyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? { createdAt: { ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}), ...(query.toDate ? { lte: new Date(query.toDate) } : {}) } }
        : {}),
      policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
    };

    const [items, total] = await Promise.all([this.repo.findMany(where, skip, limit), this.repo.count(where)]);
    return { items: items.map(toCommissionResponse), total };
  }

  // ─── Calculate ──────────────────────────────────────────────────────────────

  /**
   * Called when a policy is issued (same transaction) and by FINANCE to recalculate. Issuing never
   * fails because of commission: a missing rate just records an audit entry and creates nothing.
   * Recalculation is only allowed while every row is still CALCULATED — once approved the numbers
   * are committed and changes must go through adjustments (D27).
   */
  @Transactional()
  async calculateForPolicy(policyId: string, source: 'ISSUE' | 'MANUAL'): Promise<CalculationOutcome> {
    const userId = this.cls.get('userId');
    const policy = await this.txHost.tx.policy.findFirst({
      where: { id: policyId },
      include: {
        job: { select: { agentId: true, productId: true, jobNo: true } },
        quotation: { include: { versions: { where: { deletedAt: null }, orderBy: { version: 'desc' } } } },
      },
    });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    if (source === 'MANUAL' && policy.status === 'CANCELLED') {
      throw new BusinessException('POLICY_INVALID_STATUS', 'Cannot calculate commission for a cancelled policy', 409);
    }

    const live = await this.repo.findLiveCalculated(policyId);
    if (live.length > 0 && source === 'ISSUE') {
      return { outcome: 'EXISTS', commissions: (await this.repo.findByPolicy(policyId)).map(toCommissionResponse) };
    }
    if (live.some((c) => c.status !== CommissionStatus.CALCULATED)) {
      throw new BusinessException(
        'COMMISSION_LOCKED',
        'Commission has already been approved — use an adjustment instead of recalculating',
        409,
      );
    }

    const resolved = await this.resolveRate(policy);
    if (!resolved) {
      await this.audit.log({
        action: 'COMMISSION_SKIPPED',
        entityType: 'POLICY',
        entityId: policyId,
        jobId: policy.jobId,
        remark: 'No commission rate on the selected quotation or in the commission rate master',
      });
      return { outcome: 'NO_RATE' };
    }

    const agent = await this.txHost.tx.user.findFirst({
      where: { id: policy.job.agentId, deletedAt: null },
      select: { id: true, agentSharePct: true, managerId: true },
    });
    const manager = agent?.managerId
      ? await this.txHost.tx.user.findFirst({ where: { id: agent.managerId, isActive: true, deletedAt: null }, select: { id: true } })
      : null;
    const cfg = await this.settings.getCommissionSettings();

    let breakdown;
    try {
      breakdown = computeCommissionBreakdown({
        netPremium: policy.netPremium.toString(),
        ratePct: resolved.rate,
        agentSharePct: agent?.agentSharePct?.toString() ?? cfg.defaultAgentSharePct,
        overridePct: cfg.overridePct,
        whtPct: cfg.whtPct,
        hasManager: Boolean(manager),
      });
    } catch (err) {
      if (!(err instanceof CommissionShareError)) throw err;
      await this.audit.log({
        action: 'COMMISSION_SKIPPED',
        entityType: 'POLICY',
        entityId: policyId,
        jobId: policy.jobId,
        remark: err.message,
      });
      return { outcome: 'SHARE_EXCEEDS_100' };
    }

    for (const old of live) {
      await this.repo.update(old.id, {
        status: CommissionStatus.CANCELLED,
        remark: `${old.remark ? `${old.remark} · ` : ''}Superseded by recalculation`,
      });
    }

    const common = {
      policy: { connect: { id: policyId } },
      commissionRate: resolved.rate,
      commissionBase: policy.netPremium.toString(),
      grossAmount: breakdown.gross,
      whtRate: breakdown.whtPct,
      rateSource: resolved.source,
      status: CommissionStatus.CALCULATED,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    } satisfies Partial<Prisma.CommissionCreateInput>;

    await this.repo.create({
      ...common,
      agent: { connect: { id: policy.job.agentId } },
      commissionType: 'AGENT',
      commissionAmount: breakdown.agent.shareAmount,
      sharePct: breakdown.agent.sharePct,
      whtAmount: breakdown.agent.whtAmount,
      netAmount: breakdown.agent.netAmount,
      brokerShareAmount: breakdown.brokerShare,
    });
    if (breakdown.override && manager) {
      await this.repo.create({
        ...common,
        agent: { connect: { id: manager.id } },
        commissionType: 'TEAM',
        commissionAmount: breakdown.override.shareAmount,
        sharePct: breakdown.override.sharePct,
        whtAmount: breakdown.override.whtAmount,
        netAmount: breakdown.override.netAmount,
        remark: 'Override',
      });
    }

    await this.audit.log({
      action: 'CALCULATE_COMMISSION',
      entityType: 'POLICY',
      entityId: policyId,
      jobId: policy.jobId,
      after: { rate: resolved.rate, rateSource: resolved.source, ...breakdown },
      remark: source === 'MANUAL' ? 'Recalculated' : undefined,
    });

    return {
      outcome: 'CREATED',
      commissions: (await this.repo.findByPolicy(policyId)).map(toCommissionResponse),
    };
  }

  /** POST /policies/:id/commissions/calculate — explicit failures, unlike the quiet issue-time call. */
  @Transactional()
  async recalculate(policyId: string): Promise<CommissionListResponse> {
    await this.assertPolicyAccess(policyId);
    const result = await this.calculateForPolicy(policyId, 'MANUAL');
    if (result.outcome === 'NO_RATE') {
      throw new BusinessException(
        'COMMISSION_RATE_NOT_FOUND',
        'No commission rate found for this insurer and product — add one in the commission rate master first',
        422,
      );
    }
    if (result.outcome === 'SHARE_EXCEEDS_100') {
      throw new BusinessException('COMMISSION_SHARE_EXCEEDS_100', 'Agent share + override exceeds 100%', 422);
    }
    return this.listByPolicy(policyId);
  }

  /** Selected quotation's rate wins (it is what the insurer actually quoted); otherwise the master at inception. */
  private async resolveRate(policy: {
    insuranceCompanyId: string;
    effectiveDate: Date;
    job: { productId: string };
    quotation: { versions: { status: string; commissionRate: { toString(): string } | null }[] };
  }): Promise<{ rate: string; source: 'QUOTATION' | 'MASTER' } | null> {
    const versions = policy.quotation.versions;
    const chosen = versions.find((v) => v.status === 'SELECTED') ?? versions[0];
    if (chosen?.commissionRate != null) return { rate: chosen.commissionRate.toString(), source: 'QUOTATION' };

    const master = await this.txHost.tx.commissionRate.findFirst({
      where: {
        insuranceCompanyId: policy.insuranceCompanyId,
        productId: policy.job.productId,
        deletedAt: null,
        effectiveFrom: { lte: policy.effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: policy.effectiveDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return master ? { rate: master.rate.toString(), source: 'MASTER' } : null;
  }

  // ─── Approve / payable ──────────────────────────────────────────────────────

  @Transactional()
  async approve(id: string): Promise<CommissionResponse> {
    const userId = this.cls.get('userId');
    const found = await this.repo.findById(id);
    if (!found) throw new BusinessException('COMMISSION_NOT_FOUND', 'Commission not found', 404);
    const policy = await this.assertPolicyAccess(found.policyId);

    if (found.grossAmount == null) {
      throw new BusinessException('COMMISSION_NOT_CALCULATED', 'Manually entered (V1) commissions cannot be approved', 409);
    }
    if (found.status !== CommissionStatus.CALCULATED) {
      throw new BusinessException('COMMISSION_INVALID_STATUS', `Cannot approve a commission in status ${found.status}`, 409);
    }

    const updated = await this.repo.update(id, {
      status: CommissionStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: userId ? { connect: { id: userId } } : undefined,
    });
    await this.audit.log({
      action: 'APPROVE_COMMISSION',
      entityType: 'COMMISSION',
      entityId: id,
      jobId: policy.jobId,
      before: { status: found.status },
      after: { status: updated.status },
    });

    // Every instalment may already be paid: then it is payable straight away
    await this.syncPayable(found.policyId);
    return toCommissionResponse((await this.repo.findById(id))!);
  }

  /**
   * D-13: an APPROVED commission becomes PAYABLE once every non-cancelled invoice of its policy is
   * PAID, and goes back to APPROVED if a payment is cancelled afterwards. Driven by invoice status
   * changes, so it is idempotent and safe to call whenever invoices may have moved.
   */
  async syncPayable(policyId: string): Promise<void> {
    const invoices = await this.repo.invoiceStatuses(policyId);
    const allPaid = invoices.length > 0 && invoices.every((i) => i.status === 'PAID');
    const from = allPaid ? CommissionStatus.APPROVED : CommissionStatus.PAYABLE;
    const to = allPaid ? CommissionStatus.PAYABLE : CommissionStatus.APPROVED;

    const rows = await this.repo.findV2ByStatus(policyId, from as 'APPROVED' | 'PAYABLE');
    if (rows.length === 0) return;

    const policy = await this.txHost.tx.policy.findFirst({ where: { id: policyId }, select: { jobId: true } });
    for (const row of rows) {
      await this.repo.update(row.id, { status: to, payableAt: allPaid ? new Date() : null });
      await this.audit.log({
        action: 'COMMISSION_STATUS_CHANGED',
        entityType: 'COMMISSION',
        entityId: row.id,
        jobId: policy?.jobId,
        before: { status: from },
        after: { status: to },
        remark: allPaid ? 'All invoices of the policy are paid' : 'A payment on the policy was cancelled',
      });
    }
  }
}
