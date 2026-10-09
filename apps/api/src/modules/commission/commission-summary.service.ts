import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Decimal } from 'decimal.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CommissionStatus } from '../../generated/prisma/enums.js';
import { bangkokDateString } from '../invoice/domain/invoice-status.js';
import { summarizeCommissions, type SummaryCommissionRow, type SummaryGroup, type SummaryGroupBy } from './domain/summary.js';
import type { CommissionSummaryQueryDto } from './dto/summary-query.dto.js';

export interface CommissionSummaryResponse {
  groupBy: SummaryGroupBy;
  items: SummaryGroup[];
  total: number;
  page: number;
  perPage: number;
  /** Totals over everything matching the filters, not just this page. */
  summary: SummaryGroup;
}

@Injectable()
export class CommissionSummaryService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
  ) {}

  /** Calculated commissions rolled up by agent / policy / insurer / product / policy-issue month. */
  async summarize(dto: CommissionSummaryQueryDto): Promise<CommissionSummaryResponse> {
    const groupBy = dto.groupBy ?? 'agent';
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const db = this.txHost.tx;

    const where: Prisma.CommissionWhereInput = {
      grossAmount: { not: null },
      status: dto.status ?? { not: CommissionStatus.CANCELLED },
      ...(dto.agentId ? { agentId: dto.agentId } : {}),
      policy: {
        ...(dto.insurerId ? { insuranceCompanyId: dto.insurerId } : {}),
        job: { deletedAt: null, ...(dto.productId ? { productId: dto.productId } : {}), ...this.scope.jobViewScope() },
      },
    };
    const commissions = await db.commission.findMany({
      where,
      include: {
        agent: { select: { id: true, fullName: true } },
        policy: {
          select: {
            policyNo: true,
            issuedAt: true,
            createdAt: true,
            insuranceCompany: { select: { id: true, name: true } },
            job: { select: { product: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const adjustments = await db.commissionAdjustment.groupBy({
      by: ['commissionId'],
      where: { commissionId: { in: commissions.map((c) => c.id) } },
      _sum: { netAmount: true },
    });
    const adjustmentByCommission = new Map(adjustments.map((a) => [a.commissionId, (a._sum.netAmount ?? 0).toString()]));

    const rows: SummaryCommissionRow[] = commissions
      .map((c) => ({
        commissionType: c.commissionType,
        status: c.status,
        shareAmount: c.commissionAmount.toString(),
        whtAmount: (c.whtAmount ?? 0).toString(),
        netAmount: (c.netAmount ?? 0).toString(),
        grossAmount: (c.grossAmount ?? 0).toString(),
        brokerShareAmount: c.brokerShareAmount?.toString() ?? null,
        payeeId: c.agent?.id ?? 'unknown',
        payeeName: c.agent?.fullName ?? '-',
        policyId: c.policyId,
        policyNo: c.policy.policyNo,
        insurerId: c.policy.insuranceCompany.id,
        insurerName: c.policy.insuranceCompany.name,
        productId: c.policy.job.product.id,
        productName: c.policy.job.product.name,
        period: bangkokDateString(c.policy.issuedAt ?? c.policy.createdAt).slice(0, 7),
        adjustmentNet: new Decimal(adjustmentByCommission.get(c.id) ?? 0).toFixed(2),
      }))
      .filter((r) => (!dto.from || r.period >= dto.from) && (!dto.to || r.period <= dto.to));

    const { groups, total } = summarizeCommissions(rows, groupBy);
    const start = (page - 1) * perPage;
    return { groupBy, items: groups.slice(start, start + perPage), total: groups.length, page, perPage, summary: total };
  }
}
