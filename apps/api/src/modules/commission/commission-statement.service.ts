import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import type { CommissionStatement, Prisma } from '../../generated/prisma/client.js';
import { CommissionAdjustmentStatus, CommissionStatementStatus, CommissionStatus } from '../../generated/prisma/enums.js';
import { bangkokDateString } from '../invoice/domain/invoice-status.js';
import { toAdjustmentResponse, type AdjustmentResponse } from './commission-adjustment.service.js';
import { currentPeriod, periodRange, selectStatementItems } from './domain/statement.js';
import { toCommissionResponse, type CommissionResponse } from './dto/commission.response.js';
import type { CancelStatementDto, CreateStatementDto, ListStatementDto, MarkStatementPaidDto } from './dto/statement.dto.js';

export interface StatementResponse {
  id: string;
  statementNo: string;
  agentId: string;
  agent: { id: string; fullName: string } | null;
  period: string;
  periodEnd: string;
  status: CommissionStatement['status'];
  shareTotal: string;
  whtTotal: string;
  netTotal: string;
  confirmedAt: string | null;
  paidAt: string | null;
  paidDate: string | null;
  paymentRef: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  commissionCount: number;
  adjustmentCount: number;
}

export interface StatementDetailResponse extends StatementResponse {
  commissions: CommissionResponse[];
  adjustments: AdjustmentResponse[];
}

type StatementRow = CommissionStatement & {
  agent: { id: string; fullName: string } | null;
  _count: { commissions: number; adjustments: number };
};

const LIST_INCLUDE = {
  agent: { select: { id: true, fullName: true } },
  _count: { select: { commissions: true, adjustments: true } },
} as const;

function toStatementResponse(s: StatementRow): StatementResponse {
  return {
    id: s.id,
    statementNo: s.statementNo,
    agentId: s.agentId,
    agent: s.agent,
    period: s.period,
    periodEnd: s.periodEnd.toISOString().slice(0, 10),
    status: s.status,
    shareTotal: s.shareTotal.toFixed(2),
    whtTotal: s.whtTotal.toFixed(2),
    netTotal: s.netTotal.toFixed(2),
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
    paidDate: s.paidDate ? s.paidDate.toISOString().slice(0, 10) : null,
    paymentRef: s.paymentRef,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    createdAt: s.createdAt.toISOString(),
    commissionCount: s._count.commissions,
    adjustmentCount: s._count.adjustments,
  };
}

/**
 * Monthly payout statement per payee: DRAFT (items attached) → CONFIRMED → PAID. Marking it paid is
 * what moves its commissions to PAID and settles its adjustments; cancelling releases everything.
 */
@Injectable()
export class CommissionStatementService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly sequence: SequenceService,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Finance sees every statement; anyone else only their own payouts. */
  private canSeeAll(): boolean {
    return (this.cls.get('permissions') ?? []).includes('commission.statement');
  }

  private async load(id: string): Promise<StatementRow> {
    const row = await this.db.commissionStatement.findFirst({ where: { id }, include: LIST_INCLUDE });
    if (!row || (!this.canSeeAll() && row.agentId !== this.cls.get('userId'))) {
      throw new BusinessException('STATEMENT_NOT_FOUND', 'Commission statement not found', 404);
    }
    return row;
  }

  async list(dto: ListStatementDto): Promise<{ items: StatementResponse[]; total: number; page: number; perPage: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: Prisma.CommissionStatementWhereInput = {
      ...(this.canSeeAll() ? (dto.agentId ? { agentId: dto.agentId } : {}) : { agentId: this.cls.get('userId') ?? '' }),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.period ? { period: dto.period } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.commissionStatement.findMany({ where, include: LIST_INCLUDE, skip: (page - 1) * perPage, take: perPage, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }] }),
      this.db.commissionStatement.count({ where }),
    ]);
    return { items: items.map(toStatementResponse), total, page, perPage };
  }

  async get(id: string): Promise<StatementDetailResponse> {
    const statement = await this.load(id);
    const [commissions, adjustments] = await Promise.all([
      this.db.commission.findMany({
        where: { statementId: id },
        include: { agent: { select: { id: true, fullName: true } }, policy: { select: { id: true, policyNo: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.commissionAdjustment.findMany({ where: { statementId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      ...toStatementResponse(statement),
      commissions: commissions.map(toCommissionResponse),
      adjustments: adjustments.map(toAdjustmentResponse),
    };
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  @Transactional()
  async create(dto: CreateStatementDto, now: Date = new Date()): Promise<StatementDetailResponse> {
    const userId = this.cls.get('userId');
    const range = periodRange(dto.period);
    if (!range) throw new BusinessException('STATEMENT_PERIOD_INVALID', 'period must be a valid month, YYYY-MM', 422);
    if (dto.period > currentPeriod(now)) {
      throw new BusinessException('STATEMENT_PERIOD_IN_FUTURE', 'A statement cannot be created for a month that has not started', 422);
    }

    const payee = await this.db.user.findFirst({ where: { id: dto.agentId, deletedAt: null }, select: { id: true } });
    if (!payee) throw new BusinessException('USER_NOT_FOUND', 'Payee not found', 404);

    const existing = await this.db.commissionStatement.findFirst({
      where: { agentId: dto.agentId, period: dto.period, status: { not: CommissionStatementStatus.CANCELLED } },
      select: { statementNo: true },
    });
    if (existing) {
      throw new BusinessException('STATEMENT_ALREADY_EXISTS', `${existing.statementNo} already covers this payee and month`, 409);
    }

    const [commissions, adjustments] = await Promise.all([
      this.db.commission.findMany({
        where: {
          agentId: dto.agentId,
          status: CommissionStatus.PAYABLE,
          statementId: null,
          grossAmount: { not: null },
          payableAt: { lt: range.endExclusive },
        },
        orderBy: { payableAt: 'asc' },
      }),
      this.db.commissionAdjustment.findMany({
        where: { agentId: dto.agentId, status: CommissionAdjustmentStatus.PENDING, createdAt: { lt: range.endExclusive } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const selection = selectStatementItems(
      commissions.map((c) => ({
        id: c.id,
        shareAmount: c.commissionAmount.toString(),
        whtAmount: (c.whtAmount ?? 0).toString(),
        netAmount: (c.netAmount ?? 0).toString(),
      })),
      adjustments.map((a) => ({
        id: a.id,
        shareAmount: a.amount.toString(),
        whtAmount: a.whtAmount.toString(),
        netAmount: a.netAmount.toString(),
        createdAt: a.createdAt,
      })),
    );
    if (selection.commissionIds.length === 0 && selection.adjustmentIds.length === 0) {
      throw new BusinessException('STATEMENT_NOTHING_TO_PAY', 'Nothing is payable to this payee for the month', 422);
    }

    const statement = await this.db.commissionStatement.create({
      data: {
        statementNo: await this.sequence.next('STATEMENT', now),
        agentId: dto.agentId,
        period: dto.period,
        periodEnd: new Date(`${range.lastDay}T00:00:00Z`),
        shareTotal: selection.shareTotal,
        whtTotal: selection.whtTotal,
        netTotal: selection.netTotal,
        createdById: userId ?? null,
      },
    });

    // Only claim rows nobody else took in the meantime; a mismatch rolls the whole statement back
    const claimedCommissions = await this.db.commission.updateMany({
      where: { id: { in: selection.commissionIds }, status: CommissionStatus.PAYABLE, statementId: null },
      data: { statementId: statement.id },
    });
    const claimedAdjustments = await this.db.commissionAdjustment.updateMany({
      where: { id: { in: selection.adjustmentIds }, status: CommissionAdjustmentStatus.PENDING, statementId: null },
      data: { statementId: statement.id, status: CommissionAdjustmentStatus.IN_STATEMENT },
    });
    if (claimedCommissions.count !== selection.commissionIds.length || claimedAdjustments.count !== selection.adjustmentIds.length) {
      throw new BusinessException('STATEMENT_CONFLICT', 'Items changed while the statement was being created — try again', 409);
    }

    await this.audit.log({
      action: 'CREATE_COMMISSION_STATEMENT',
      entityType: 'COMMISSION_STATEMENT',
      entityId: statement.id,
      after: {
        statementNo: statement.statementNo,
        agentId: dto.agentId,
        period: dto.period,
        commissions: selection.commissionIds.length,
        adjustments: selection.adjustmentIds.length,
        deferredAdjustments: selection.deferredAdjustmentIds.length,
        netTotal: selection.netTotal,
      },
    });
    return this.get(statement.id);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  @Transactional()
  async confirm(id: string): Promise<StatementDetailResponse> {
    const found = await this.load(id);
    if (found.status !== CommissionStatementStatus.DRAFT) {
      throw new BusinessException('STATEMENT_INVALID_STATUS', `Cannot confirm a statement in status ${found.status}`, 409);
    }
    if (found.netTotal.isNegative()) {
      throw new BusinessException('STATEMENT_NEGATIVE', 'A statement that nets below zero cannot be confirmed', 422);
    }
    const res = await this.db.commissionStatement.updateMany({
      where: { id, status: CommissionStatementStatus.DRAFT },
      data: { status: CommissionStatementStatus.CONFIRMED, confirmedAt: new Date() },
    });
    if (res.count !== 1) throw new BusinessException('STATEMENT_INVALID_STATUS', 'Statement was changed by someone else', 409);

    await this.audit.log({
      action: 'CONFIRM_COMMISSION_STATEMENT',
      entityType: 'COMMISSION_STATEMENT',
      entityId: id,
      before: { status: found.status },
      after: { status: CommissionStatementStatus.CONFIRMED },
    });
    return this.get(id);
  }

  @Transactional()
  async markPaid(id: string, dto: MarkStatementPaidDto, now: Date = new Date()): Promise<StatementDetailResponse> {
    const userId = this.cls.get('userId');
    const found = await this.load(id);
    if (found.status !== CommissionStatementStatus.CONFIRMED) {
      throw new BusinessException('STATEMENT_INVALID_STATUS', `Only a confirmed statement can be paid (status is ${found.status})`, 409);
    }

    const today = bangkokDateString(now);
    const paidDate = dto.paidDate ? dto.paidDate.slice(0, 10) : today;
    if (paidDate > today) {
      throw new BusinessException('STATEMENT_PAID_DATE_IN_FUTURE', 'The payment date cannot be in the future', 422);
    }

    const res = await this.db.commissionStatement.updateMany({
      where: { id, status: CommissionStatementStatus.CONFIRMED },
      data: {
        status: CommissionStatementStatus.PAID,
        paidAt: now,
        paidDate: new Date(`${paidDate}T00:00:00Z`),
        paymentRef: dto.paymentRef ?? null,
        paidById: userId ?? null,
      },
    });
    if (res.count !== 1) throw new BusinessException('STATEMENT_INVALID_STATUS', 'Statement was changed by someone else', 409);

    const rows = await this.db.commission.findMany({ where: { statementId: id }, select: { id: true, policyId: true, status: true } });
    const moved = await this.db.commission.updateMany({
      where: { statementId: id, status: CommissionStatus.PAYABLE },
      data: { status: CommissionStatus.PAID, paidDate: new Date(`${paidDate}T00:00:00Z`) },
    });
    if (moved.count !== rows.length) {
      throw new BusinessException('STATEMENT_CONFLICT', 'A commission on this statement is no longer payable', 409);
    }
    await this.db.commissionAdjustment.updateMany({
      where: { statementId: id },
      data: { status: CommissionAdjustmentStatus.SETTLED },
    });

    for (const row of rows) {
      await this.audit.log({
        action: 'COMMISSION_STATUS_CHANGED',
        entityType: 'COMMISSION',
        entityId: row.id,
        before: { status: row.status },
        after: { status: CommissionStatus.PAID },
        remark: `Paid on ${found.statementNo}`,
      });
    }
    await this.audit.log({
      action: 'PAY_COMMISSION_STATEMENT',
      entityType: 'COMMISSION_STATEMENT',
      entityId: id,
      before: { status: found.status },
      after: { status: CommissionStatementStatus.PAID, paidDate, netTotal: found.netTotal.toFixed(2) },
      remark: dto.paymentRef,
    });
    return this.get(id);
  }

  /** A paid statement is final. Anything earlier can be cancelled, which hands every item back untouched. */
  @Transactional()
  async cancel(id: string, dto: CancelStatementDto): Promise<StatementDetailResponse> {
    const found = await this.load(id);
    if (found.status === CommissionStatementStatus.PAID) {
      throw new BusinessException('STATEMENT_ALREADY_PAID', 'A paid statement cannot be cancelled', 409);
    }
    if (found.status === CommissionStatementStatus.CANCELLED) {
      throw new BusinessException('STATEMENT_INVALID_STATUS', 'Statement is already cancelled', 409);
    }

    await this.db.commission.updateMany({ where: { statementId: id }, data: { statementId: null } });
    await this.db.commissionAdjustment.updateMany({
      where: { statementId: id },
      data: { statementId: null, status: CommissionAdjustmentStatus.PENDING },
    });
    await this.db.commissionStatement.update({
      where: { id },
      data: { status: CommissionStatementStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason },
    });

    await this.audit.log({
      action: 'CANCEL_COMMISSION_STATEMENT',
      entityType: 'COMMISSION_STATEMENT',
      entityId: id,
      before: { status: found.status },
      after: { status: CommissionStatementStatus.CANCELLED },
      remark: dto.reason,
    });
    return this.get(id);
  }
}
