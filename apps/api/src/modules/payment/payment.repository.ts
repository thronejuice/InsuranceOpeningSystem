import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const WITH_RECEIPT = { receipt: true } as const;

@Injectable()
export class PaymentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findByPolicy(policyId: string) {
    return this.db.payment.findMany({
      where: { policyId },
      include: WITH_RECEIPT,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.payment.findFirst({ where: { id }, include: WITH_RECEIPT });
  }

  create(data: Prisma.PaymentCreateInput) {
    return this.db.payment.create({ data, include: WITH_RECEIPT });
  }

  update(id: string, data: Prisma.PaymentUpdateInput) {
    return this.db.payment.update({ where: { id }, data, include: WITH_RECEIPT });
  }

  createReceipt(data: Prisma.ReceiptCreateInput) {
    return this.db.receipt.create({ data });
  }

  voidReceiptOfPayment(paymentId: string, data: Prisma.ReceiptUpdateInput) {
    return this.db.receipt.update({ where: { paymentId }, data });
  }

  async findMany(params: { where: Prisma.PaymentWhereInput; skip: number; take: number }) {
    const [items, total] = await Promise.all([
      this.db.payment.findMany({ ...params, include: WITH_RECEIPT, orderBy: { createdAt: 'desc' } }),
      this.db.payment.count({ where: params.where }),
    ]);
    return { items, total };
  }

  /** Sum of ACTIVE payments for a policy */
  async sumActive(policyId: string): Promise<string> {
    const result = await this.db.payment.aggregate({
      where: { policyId, status: 'ACTIVE' },
      _sum: { amount: true },
    });
    return (result._sum.amount ?? 0).toString();
  }
}
