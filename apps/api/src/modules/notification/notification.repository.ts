import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class NotificationRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  findMany(where: Prisma.NotificationWhereInput, skip: number, take: number) {
    return this.db.notification.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where: Prisma.NotificationWhereInput) {
    return this.db.notification.count({ where });
  }

  findById(id: string) {
    return this.db.notification.findFirst({ where: { id } });
  }

  create(data: Prisma.NotificationCreateInput) {
    return this.db.notification.create({ data });
  }

  updateMany(where: Prisma.NotificationWhereInput, data: Prisma.NotificationUpdateManyMutationInput) {
    return this.db.notification.updateMany({ where, data });
  }
}
