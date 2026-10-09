import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { RENEWAL_INCLUDE } from './dto/renewal.response.js';

@Injectable()
export class RenewalRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findMany(where: Prisma.RenewalWhereInput, skip: number, take: number) {
    return this.db.renewal.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: RENEWAL_INCLUDE });
  }

  count(where: Prisma.RenewalWhereInput) {
    return this.db.renewal.count({ where });
  }

  findById(id: string) {
    return this.db.renewal.findFirst({ where: { id }, include: RENEWAL_INCLUDE });
  }

  findActiveByPolicyId(previousPolicyId: string) {
    return this.db.renewal.findFirst({
      where: {
        previousPolicyId,
        status: { notIn: ['CANCELLED', 'LOST', 'RENEWED'] },
      },
    });
  }

  findPoliciesExpiring(startOfDay: Date, endOfDay: Date) {
    return this.db.policy.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
        expiryDate: { gte: startOfDay, lte: endOfDay },
      },
      include: { job: { select: { assignedTo: true, agentId: true } } },
    });
  }

  create(data: Prisma.RenewalCreateInput) {
    return this.db.renewal.create({ data, include: RENEWAL_INCLUDE });
  }

  update(id: string, data: Prisma.RenewalUpdateInput) {
    return this.db.renewal.update({ where: { id }, data, include: RENEWAL_INCLUDE });
  }
}
