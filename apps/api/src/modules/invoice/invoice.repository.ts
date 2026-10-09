import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { InvoiceStatus } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class InvoiceRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  findByPolicy(policyId: string) {
    return this.db.invoice.findMany({
      where: { policyId },
      include: {
        customer: {
          select: { id: true, customerCode: true, companyName: true, firstName: true, lastName: true },
        },
        policy: {
          select: { id: true, policyNo: true, jobId: true },
        },
      },
      orderBy: [{ installmentNo: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string) {
    return this.db.invoice.findFirst({
      where: { id },
      include: {
        customer: {
          select: { id: true, customerCode: true, companyName: true, firstName: true, lastName: true },
        },
        policy: {
          select: { id: true, policyNo: true, jobId: true },
        },
      },
    });
  }

  /** Sum of ACTIVE payments per invoice; invoices with none are simply absent from the map. */
  async sumActivePayments(invoiceIds: string[]): Promise<Map<string, string>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.db.payment.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds }, status: 'ACTIVE' },
      _sum: { amount: true },
    });
    return new Map(rows.map((r) => [r.invoiceId as string, (r._sum.amount ?? 0).toString()]));
  }

  /** Serialises concurrent payments on the same invoice so the outstanding check cannot be raced. */
  async lockForUpdate(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /** Still-open invoices whose due date is before `today` (a UTC-midnight DATE). */
  findOpenDueBefore(today: Date, statuses: InvoiceStatus[]) {
    return this.db.invoice.findMany({
      where: { status: { in: statuses }, dueDate: { lt: today } },
      select: { id: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Not-yet-overdue invoices due within [today, end] that have not had their reminder yet. */
  findDueSoonUnreminded(today: Date, end: Date) {
    return this.db.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        dueDate: { gte: today, lte: end },
        dueReminderSentAt: null,
      },
      select: { id: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  findForNotification(id: string) {
    return this.db.invoice.findFirst({
      where: { id },
      include: {
        policy: {
          select: { policyNo: true, jobId: true, job: { select: { agentId: true, brokerStaffId: true } } },
        },
      },
    });
  }

  create(data: Prisma.InvoiceCreateInput) {
    return this.db.invoice.create({ data });
  }

  createMany(data: Prisma.InvoiceCreateManyInput[]) {
    return this.db.invoice.createMany({ data });
  }

  update(id: string, data: Prisma.InvoiceUpdateInput) {
    return this.db.invoice.update({ where: { id }, data });
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    where?: Prisma.InvoiceWhereInput;
    orderBy?: Prisma.InvoiceOrderByWithRelationInput;
  }) {
    const { skip, take, where, orderBy } = params;
    const [total, data] = await Promise.all([
      this.db.invoice.count({ where }),
      this.db.invoice.findMany({
        skip,
        take,
        where,
        orderBy: orderBy ?? { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, customerCode: true, companyName: true, firstName: true, lastName: true },
          },
          policy: {
            select: { id: true, policyNo: true, jobId: true },
          },
        },
      }),
    ]);
    return { data, total };
  }
}

