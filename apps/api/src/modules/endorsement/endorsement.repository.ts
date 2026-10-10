import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class EndorsementRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  findByPolicy(policyId: string) {
    return this.db.endorsement.findMany({
      where: { policyId },
      include: {
        policy: { select: { id: true, policyNo: true } },
        insurerDocument: { select: { id: true, originalName: true } },
        requestedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        issuedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.db.endorsement.findFirst({
      where: { id },
      include: {
        policy: { select: { id: true, policyNo: true, jobId: true, status: true } },
        insurerDocument: { select: { id: true, originalName: true } },
        requestedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        issuedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  create(data: Prisma.EndorsementCreateInput) {
    return this.db.endorsement.create({ data });
  }

  update(id: string, data: Prisma.EndorsementUpdateInput) {
    return this.db.endorsement.update({
      where: { id },
      data,
      include: {
        policy: { select: { id: true, policyNo: true } },
        insurerDocument: { select: { id: true, originalName: true } },
        requestedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        issuedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    where?: Prisma.EndorsementWhereInput;
    orderBy?: Prisma.EndorsementOrderByWithRelationInput;
  }) {
    const { skip, take, where, orderBy } = params;
    const [total, data] = await Promise.all([
      this.db.endorsement.count({ where }),
      this.db.endorsement.findMany({
        skip,
        take,
        where,
        orderBy: orderBy ?? { createdAt: 'desc' },
        include: {
          policy: { select: { id: true, policyNo: true } },
          insurerDocument: { select: { id: true, originalName: true } },
          requestedBy: { select: { id: true, fullName: true } },
          reviewedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          issuedBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);
    return { data, total };
  }
}

