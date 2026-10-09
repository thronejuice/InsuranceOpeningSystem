import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Decimal } from 'decimal.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { InvoiceRepository } from './invoice.repository.js';
import type { ListReceivableDto } from './dto/list-receivable.dto.js';
import { outstandingAmount } from './domain/invoice-status.js';
import {
  groupReceivables,
  type OutstandingInvoiceRow,
  type ReceivableGroup,
  type ReceivableSummary,
} from './domain/receivables.js';

export interface ReceivableListResponse {
  groupBy: 'customer' | 'policy';
  asOf: string;
  items: ReceivableGroup[];
  total: number;
  page: number;
  perPage: number;
  summary: ReceivableSummary;
}

@Injectable()
export class ReceivableService {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
  ) {}

  /** AR: what is still owed, per customer or per policy, with aging by days past due. */
  async list(dto: ListReceivableDto, now: Date = new Date()): Promise<ReceivableListResponse> {
    const groupBy = dto.groupBy ?? 'customer';
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;

    const where: Prisma.InvoiceWhereInput = {
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      type: { in: ['INVOICE', 'DEBIT_NOTE'] },
      ...(dto.customerId ? { customerId: dto.customerId } : {}),
      ...(dto.policyId ? { policyId: dto.policyId } : {}),
      policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
    };

    const invoices = await this.txHost.tx.invoice.findMany({
      where,
      select: {
        id: true,
        amount: true,
        dueDate: true,
        customerId: true,
        policyId: true,
        customer: { select: { customerCode: true, companyName: true, firstName: true, lastName: true } },
        policy: { select: { policyNo: true } },
      },
    });
    const paid = await this.repo.sumActivePayments(invoices.map((i) => i.id));

    const rows: OutstandingInvoiceRow[] = invoices.map((inv) => ({
      customerId: inv.customerId,
      customerName:
        inv.customer.companyName ||
        [inv.customer.firstName, inv.customer.lastName].filter(Boolean).join(' ') ||
        inv.customer.customerCode,
      policyId: inv.policyId,
      policyNo: inv.policy.policyNo,
      dueDate: inv.dueDate,
      outstanding: outstandingAmount(inv.amount.toString(), new Decimal(paid.get(inv.id) ?? 0)).toFixed(2),
    }));

    const { groups, summary } = groupReceivables(rows, groupBy, now);
    const start = (page - 1) * perPage;
    return {
      groupBy,
      asOf: now.toISOString(),
      items: groups.slice(start, start + perPage),
      total: groups.length,
      page,
      perPage,
      summary,
    };
  }
}
