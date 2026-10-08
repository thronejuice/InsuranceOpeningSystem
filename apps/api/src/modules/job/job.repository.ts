import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class JobRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  private static readonly INCLUDE = {
    customer: { select: { id: true, customerCode: true, firstName: true, lastName: true, companyName: true, customerType: true } },
    insuranceType: { select: { id: true, code: true, name: true } },
    product: { select: { id: true, code: true, name: true, requireUnderwriting: true } },
    agent: { select: { id: true, username: true, fullName: true, branchId: true } },
    brokerStaff: { select: { id: true, username: true, fullName: true, branchId: true } },
    branch: { select: { id: true, code: true, name: true } },
  } as const;

  findAll(where: Prisma.JobWhereInput, orderBy: Prisma.JobOrderByWithRelationInput[], skip: number, take: number) {
    return Promise.all([
      this.db.job.findMany({ where, orderBy, skip, take, include: JobRepository.INCLUDE }),
      this.db.job.count({ where }),
    ]);
  }

  findById(id: string, scopeWhere?: Prisma.JobWhereInput) {
    const where: Prisma.JobWhereInput = {
      id,
      deletedAt: null,
      ...(scopeWhere ? { AND: [scopeWhere] } : {}),
    };
    return this.db.job.findFirst({ where, include: JobRepository.INCLUDE });
  }

  create(data: Prisma.JobCreateInput) {
    return this.db.job.create({ data, include: JobRepository.INCLUDE });
  }

  update(id: string, data: Prisma.JobUpdateInput) {
    return this.db.job.update({ where: { id }, data, include: JobRepository.INCLUDE });
  }

  async findActivities(jobId: string) {
    const [histories, logs, assignmentHistories] = await Promise.all([
      this.db.jobStatusHistory.findMany({
        where: { jobId },
        orderBy: { changedAt: 'desc' },
      }),
      this.db.activityLog.findMany({
        where: { jobId },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.jobAssignmentHistory.findMany({
        where: { jobId },
        include: {
          fromUser: { select: { id: true, username: true, fullName: true } },
          toUser: { select: { id: true, username: true, fullName: true } },
          changedBy: { select: { id: true, username: true, fullName: true } },
        },
        orderBy: { changedAt: 'desc' },
      }),
    ]);
    return { histories, logs, assignmentHistories };
  }
}
