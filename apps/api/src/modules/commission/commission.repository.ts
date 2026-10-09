import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const WITH_PAYEE = {
  agent: { select: { id: true, fullName: true } },
  policy: { select: { id: true, policyNo: true } },
} as const;

@Injectable()
export class CommissionRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findByPolicy(policyId: string) {
    return this.db.commission.findMany({
      where: { policyId },
      include: WITH_PAYEE,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.commission.findFirst({ where: { id }, include: WITH_PAYEE });
  }

  findMany(where: Prisma.CommissionWhereInput, skip: number, take: number) {
    return this.db.commission.findMany({ where, skip, take, include: WITH_PAYEE, orderBy: { createdAt: 'desc' } });
  }

  count(where: Prisma.CommissionWhereInput) {
    return this.db.commission.count({ where });
  }

  /** Live V2 rows of a policy (calculated by the system, not cancelled). */
  findLiveCalculated(policyId: string) {
    return this.db.commission.findMany({
      where: { policyId, grossAmount: { not: null }, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.CommissionCreateInput) {
    return this.db.commission.create({ data, include: WITH_PAYEE });
  }

  update(id: string, data: Prisma.CommissionUpdateInput) {
    return this.db.commission.update({ where: { id }, data, include: WITH_PAYEE });
  }

  /** What the payable rule looks at: every non-cancelled invoice of the policy. */
  invoiceStatuses(policyId: string) {
    return this.db.invoice.findMany({
      where: { policyId, type: 'INVOICE', status: { not: 'CANCELLED' } },
      select: { status: true },
    });
  }

  /** Rows already placed on a statement are committed to a payout and are never moved by invoice changes. */
  findV2ByStatus(policyId: string, status: 'APPROVED' | 'PAYABLE') {
    return this.db.commission.findMany({ where: { policyId, status, grossAmount: { not: null }, statementId: null } });
  }
}
