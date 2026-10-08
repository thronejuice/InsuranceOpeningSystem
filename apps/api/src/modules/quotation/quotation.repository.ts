import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class QuotationRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  private static readonly INCLUDE = {
    insuranceCompany: { select: { id: true, name: true } },
    items: { orderBy: { createdAt: 'asc' as const } },
  } as const;

  findAll(where: Prisma.QuotationWhereInput) {
    return this.db.quotation.findMany({
      where,
      include: { ...QuotationRepository.INCLUDE, job: { select: { id: true, jobNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllByJob(jobId: string) {
    return this.db.quotation.findMany({
      where: { jobId },
      include: QuotationRepository.INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.quotation.findFirst({
      where: { id },
      include: QuotationRepository.INCLUDE,
    });
  }

  findByJobAndCompany(jobId: string, insuranceCompanyId: string) {
    return this.db.quotation.findFirst({
      where: { jobId, insuranceCompanyId },
      include: QuotationRepository.INCLUDE,
    });
  }

  create(data: Prisma.QuotationCreateInput) {
    return this.db.quotation.create({ data, include: QuotationRepository.INCLUDE });
  }

  update(id: string, data: Prisma.QuotationUpdateInput) {
    return this.db.quotation.update({ where: { id }, data, include: QuotationRepository.INCLUDE });
  }

  countReceivedForJob(jobId: string): Promise<number> {
    return this.db.quotation.count({ where: { jobId, status: 'RECEIVED' } });
  }

  countRequestedForJob(jobId: string): Promise<number> {
    return this.db.quotation.count({ where: { jobId } });
  }

  delete(id: string) {
    return this.db.quotation.delete({ where: { id } });
  }
}
