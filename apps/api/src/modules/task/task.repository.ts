import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class TaskRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  get tx() { return this.txHost.tx; }

  findJob(where: Prisma.JobWhereInput) {
    return this.tx.job.findFirst({ where: { deletedAt: null, ...where }, select: { id: true } });
  }

  findById(id: string) {
    return this.tx.task.findUnique({ where: { id } });
  }

  findByJob(jobId: string) {
    return this.tx.task.findMany({
      where: { jobId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findMany(where: Prisma.TaskWhereInput, skip: number, take: number) {
    return this.tx.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    });
  }

  count(where: Prisma.TaskWhereInput) {
    return this.tx.task.count({ where });
  }

  create(data: Prisma.TaskCreateInput) {
    return this.tx.task.create({ data });
  }

  update(id: string, data: Prisma.TaskUpdateInput) {
    return this.tx.task.update({ where: { id }, data });
  }
}
