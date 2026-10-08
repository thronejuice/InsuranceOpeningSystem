import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class ApprovalRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  private static readonly INCLUDE = {
    job: { include: { customer: true } },
    proposal: { include: { quotation: true } },
  } as const;

  findInbox(where?: { status?: string }) {
    return this.db.approval.findMany({
      where: where?.status ? { status: where.status as never } : {},
      include: ApprovalRepository.INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.db.approval.findFirst({
      where: { id },
      include: ApprovalRepository.INCLUDE,
    });
  }

  update(id: string, data: Prisma.ApprovalUpdateInput) {
    return this.db.approval.update({
      where: { id },
      data,
      include: ApprovalRepository.INCLUDE,
    });
  }
}
