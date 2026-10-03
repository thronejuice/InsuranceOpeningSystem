import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class DocumentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  create(data: Prisma.DocumentCreateInput) {
    return this.db.document.create({ data });
  }

  findById(id: string) {
    return this.db.document.findFirst({ where: { id } });
  }

  findByJobId(jobId: string) {
    return this.db.document.findMany({
      where: { jobId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  findByJobAndType(jobId: string, documentType: string) {
    return this.db.document.findMany({
      where: { jobId, documentType: documentType as never, status: 'ACTIVE' },
    });
  }

  softDelete(id: string) {
    return this.db.document.update({ where: { id }, data: { status: 'DELETED' } });
  }

  getChecklist(productId: string) {
    return this.db.documentChecklist.findMany({
      where: { productId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
