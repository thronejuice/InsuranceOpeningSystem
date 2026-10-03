import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class CommissionRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findByPolicy(policyId: string) {
    return this.db.commission.findMany({
      where: { policyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findMany(where: Prisma.CommissionWhereInput, skip: number, take: number) {
    return this.db.commission.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } });
  }

  count(where: Prisma.CommissionWhereInput) {
    return this.db.commission.count({ where });
  }

  create(data: Prisma.CommissionCreateInput) {
    return this.db.commission.create({ data });
  }
}
