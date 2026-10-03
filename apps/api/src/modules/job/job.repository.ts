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
    product: { select: { id: true, code: true, name: true } },
    agent: { select: { id: true, username: true, fullName: true } },
  } as const;

  findAll(where: Prisma.JobWhereInput, orderBy: Prisma.JobOrderByWithRelationInput[], skip: number, take: number) {
    return Promise.all([
      this.db.job.findMany({ where, orderBy, skip, take, include: JobRepository.INCLUDE }),
      this.db.job.count({ where }),
    ]);
  }

  findById(id: string) {
    return this.db.job.findFirst({ where: { id, deletedAt: null }, include: JobRepository.INCLUDE });
  }

  create(data: Prisma.JobCreateInput) {
    return this.db.job.create({ data });
  }

  update(id: string, data: Prisma.JobUpdateInput) {
    return this.db.job.update({ where: { id }, data });
  }

  async findActivities(jobId: string) {
    const [histories, logs] = await Promise.all([
      this.db.jobStatusHistory.findMany({
        where: { jobId },
        orderBy: { changedAt: 'desc' },
      }),
      this.db.activityLog.findMany({
        where: { jobId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { histories, logs };
  }
}
