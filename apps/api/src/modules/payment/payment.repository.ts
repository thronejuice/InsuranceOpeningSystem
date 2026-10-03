import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class PaymentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findByPolicy(policyId: string) {
    return this.db.payment.findMany({
      where: { policyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.payment.findFirst({ where: { id } });
  }

  create(data: Prisma.PaymentCreateInput) {
    return this.db.payment.create({ data });
  }

  update(id: string, data: Prisma.PaymentUpdateInput) {
    return this.db.payment.update({ where: { id }, data });
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
