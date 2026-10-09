import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { CommissionAdjustment, Prisma } from '../../generated/prisma/client.js';
import { CommissionStatus } from '../../generated/prisma/enums.js';
import { checkAdjustmentAmount, computeAdjustment, exceedsOriginalShare } from './domain/adjustment.js';
import type { CreateAdjustmentDto, ListAdjustmentDto } from './dto/adjustment.dto.js';

export interface AdjustmentResponse {
  id: string;
  commissionId: string;
  policyId: string;
  agentId: string;
  amount: string;
  whtRate: string;
  whtAmount: string;
  netAmount: string;
  reason: string;
  refType: string | null;
  refId: string | null;
  status: CommissionAdjustment['status'];
  statementId: string | null;
  createdById: string | null;
  createdAt: string;
}

export function toAdjustmentResponse(a: CommissionAdjustment): AdjustmentResponse {
  return {
    id: a.id,
    commissionId: a.commissionId,
    policyId: a.policyId,
    agentId: a.agentId,
    amount: a.amount.toFixed(2),
    whtRate: a.whtRate.toFixed(2),
    whtAmount: a.whtAmount.toFixed(2),
    netAmount: a.netAmount.toFixed(2),
    reason: a.reason,
    refType: a.refType,
    refId: a.refId,
    status: a.status,
    statementId: a.statementId,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
  };
}

const ADJUSTABLE: CommissionStatus[] = [CommissionStatus.APPROVED, CommissionStatus.PAYABLE, CommissionStatus.PAID];

@Injectable()
export class CommissionAdjustmentService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.db.policy.findFirst({
      where: { id: policyId, job: { deletedAt: null, ...this.scope.jobViewScope() } },
      select: { id: true, jobId: true },
    });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    return policy;
  }

  /**
   * The original commission row is never edited (D-13): a correction is a new signed row that rides
   * along on the payee's next statement.
   */
  @Transactional()
  async create(commissionId: string, dto: CreateAdjustmentDto): Promise<AdjustmentResponse> {
    const userId = this.cls.get('userId');
    const found = await this.db.commission.findFirst({ where: { id: commissionId } });
    if (!found) throw new BusinessException('COMMISSION_NOT_FOUND', 'Commission not found', 404);
    const policy = await this.assertPolicyAccess(found.policyId);

    if (found.grossAmount == null || found.agentId == null || found.whtRate == null) {
      throw new BusinessException('COMMISSION_NOT_CALCULATED', 'Only calculated (V2) commissions can be adjusted', 409);
    }

    const check = checkAdjustmentAmount(dto.amount);
    if (check === 'INVALID_FORMAT') {
      throw new BusinessException('ADJUSTMENT_AMOUNT_INVALID', 'Amount must be a signed number with at most 2 decimals', 422);
    }
    if (check === 'ZERO') {
      throw new BusinessException('ADJUSTMENT_AMOUNT_ZERO', 'Adjustment amount cannot be zero', 422);
    }
    if (Boolean(dto.refType) !== Boolean(dto.refId)) {
      throw new BusinessException('ADJUSTMENT_REF_INCOMPLETE', 'refType and refId must be given together', 422);
    }

    // Serialise adjustments on one commission so the clawback limit cannot be raced
    await this.db.$queryRaw`SELECT id FROM commissions WHERE id = ${commissionId}::uuid FOR UPDATE`;
    const locked = (await this.db.commission.findFirst({ where: { id: commissionId } }))!;
    if (!ADJUSTABLE.includes(locked.status)) {
      throw new BusinessException(
        'COMMISSION_NOT_ADJUSTABLE',
        `A commission in status ${locked.status} cannot be adjusted yet — recalculate it instead`,
        409,
      );
    }

    const earlier = await this.db.commissionAdjustment.findMany({
      where: { commissionId, amount: { lt: 0 } },
      select: { amount: true },
    });
    if (exceedsOriginalShare(earlier.map((e) => e.amount.toString()), dto.amount, locked.commissionAmount.toString())) {
      throw new BusinessException(
        'ADJUSTMENT_EXCEEDS_COMMISSION',
        `Total reductions cannot exceed this commission's original ${locked.commissionAmount.toFixed(2)}`,
        422,
      );
    }

    const amounts = computeAdjustment(dto.amount, locked.whtRate!.toString());
    const created = await this.db.commissionAdjustment.create({
      data: {
        commissionId,
        policyId: locked.policyId,
        agentId: locked.agentId!,
        amount: amounts.amount,
        whtRate: locked.whtRate!,
        whtAmount: amounts.whtAmount,
        netAmount: amounts.netAmount,
        reason: dto.reason.trim(),
        refType: dto.refType ?? null,
        refId: dto.refId ?? null,
        createdById: userId ?? null,
      },
    });

    await this.audit.log({
      action: 'CREATE_COMMISSION_ADJUSTMENT',
      entityType: 'COMMISSION_ADJUSTMENT',
      entityId: created.id,
      jobId: policy.jobId,
      after: { commissionId, ...amounts, reason: created.reason, refType: created.refType, refId: created.refId },
    });
    return toAdjustmentResponse(created);
  }

  async listByCommission(commissionId: string): Promise<AdjustmentResponse[]> {
    const commission = await this.db.commission.findFirst({ where: { id: commissionId }, select: { policyId: true } });
    if (!commission) throw new BusinessException('COMMISSION_NOT_FOUND', 'Commission not found', 404);
    await this.assertPolicyAccess(commission.policyId);
    const rows = await this.db.commissionAdjustment.findMany({ where: { commissionId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toAdjustmentResponse);
  }

  async list(dto: ListAdjustmentDto): Promise<{ items: AdjustmentResponse[]; total: number; page: number; perPage: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: Prisma.CommissionAdjustmentWhereInput = {
      ...(dto.agentId ? { agentId: dto.agentId } : {}),
      ...(dto.policyId ? { policyId: dto.policyId } : {}),
      ...(dto.commissionId ? { commissionId: dto.commissionId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      commission: { policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } } },
    };
    const [items, total] = await Promise.all([
      this.db.commissionAdjustment.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' } }),
      this.db.commissionAdjustment.count({ where }),
    ]);
    return { items: items.map(toAdjustmentResponse), total, page, perPage };
  }
}
