import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const documentInclude = {
  uploadedBy: { select: { id: true, username: true, fullName: true } },
  verifiedBy: { select: { id: true, username: true, fullName: true } },
} as const;

@Injectable()
export class DocumentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  create(data: Prisma.DocumentCreateInput) {
    return this.db.document.create({ data, include: documentInclude });
  }

  findById(id: string) {
    return this.db.document.findFirst({
      where: { id, deletedAt: null },
      include: documentInclude,
    });
  }

  findByJobId(jobId: string) {
    return this.db.document.findMany({
      where: { jobId, deletedAt: null },
      include: documentInclude,
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    });
  }

  findLatestByJobAndType(jobId: string, documentType: string) {
    return this.db.document.findFirst({
      where: { jobId, documentType: documentType as never, deletedAt: null },
      orderBy: { version: 'desc' },
      include: documentInclude,
    });
  }

  update(id: string, data: Prisma.DocumentUpdateInput) {
    return this.db.document.update({
      where: { id },
      data,
      include: documentInclude,
    });
  }

  softDelete(id: string) {
    return this.db.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  expireOutdatedDocuments(now = new Date()) {
    return this.db.document.updateMany({
      where: {
        expiryDate: { lt: now },
        status: { in: ['UPLOADED', 'UNDER_REVIEW', 'VERIFIED'] },
        deletedAt: null,
      },
      data: { status: 'EXPIRED' },
    });
  }

  getChecklist(productId: string) {
    return this.db.documentChecklist.findMany({
      where: { productId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
