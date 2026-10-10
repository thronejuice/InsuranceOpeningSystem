import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class RefundRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  private static readonly REFUND_INCLUDE = {
    creditNote: {
      select: {
        id: true,
        invoiceNo: true,
        policyId: true,
        customerId: true,
        amount: true,
        policy: {
          select: {
            id: true,
            policyNo: true,
            jobId: true,
          },
        },
      },
    },
    attachment: {
      select: {
        id: true,
        originalName: true,
        storagePath: true,
      },
    },
    requestedBy: {
      select: {
        id: true,
        fullName: true,
      },
    },
    approvedBy: {
      select: {
        id: true,
        fullName: true,
      },
    },
    processedBy: {
      select: {
        id: true,
        fullName: true,
      },
    },
  } as const;

  findMany(where: Prisma.RefundWhereInput, skip?: number, take?: number) {
    return this.db.refund.findMany({
      where,
      skip,
      take,
      include: RefundRepository.REFUND_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where: Prisma.RefundWhereInput) {
    return this.db.refund.count({ where });
  }

  findById(id: string) {
    return this.db.refund.findFirst({
      where: { id },
      include: RefundRepository.REFUND_INCLUDE,
    });
  }

  findByCreditNoteId(creditNoteId: string) {
    return this.db.refund.findFirst({
      where: { creditNoteId },
      include: RefundRepository.REFUND_INCLUDE,
    });
  }

  create(data: Prisma.RefundCreateInput) {
    return this.db.refund.create({
      data,
      include: RefundRepository.REFUND_INCLUDE,
    });
  }

  update(id: string, data: Prisma.RefundUpdateInput) {
    return this.db.refund.update({
      where: { id },
      data,
      include: RefundRepository.REFUND_INCLUDE,
    });
  }
}

