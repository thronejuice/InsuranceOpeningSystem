import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const underwritingInclude = {
  requestedBy: { select: { id: true, username: true, fullName: true } },
  underwriter: { select: { id: true, username: true, fullName: true } },
} as const;

@Injectable()
export class UnderwritingRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  create(data: Prisma.UnderwritingCreateInput) {
    return this.db.underwriting.create({ data, include: underwritingInclude });
  }

  findById(id: string) {
    return this.db.underwriting.findFirst({
      where: { id, deletedAt: null },
      include: underwritingInclude,
    });
  }

  findLatestByJobId(jobId: string) {
    return this.db.underwriting.findFirst({
      where: { jobId, deletedAt: null },
      orderBy: { version: 'desc' },
      include: underwritingInclude,
    });
  }

  findByJobId(jobId: string) {
    return this.db.underwriting.findMany({
      where: { jobId, deletedAt: null },
      orderBy: { version: 'desc' },
      include: underwritingInclude,
    });
  }

  findPendingInbox(dataScopeFilter: Prisma.JobWhereInput = {}) {
    return this.db.underwriting.findMany({
      where: {
        status: 'PENDING',
        deletedAt: null,
        job: { deletedAt: null, ...dataScopeFilter },
      },
      orderBy: { requestedAt: 'asc' },
      include: {
        ...underwritingInclude,
        job: {
          select: {
            id: true,
            jobNo: true,
            status: true,
            priority: true,
            customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
            product: { select: { id: true, code: true, name: true } },
            agent: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });
  }

  update(id: string, data: Prisma.UnderwritingUpdateInput) {
    return this.db.underwriting.update({
      where: { id },
      data,
      include: underwritingInclude,
    });
  }
}

