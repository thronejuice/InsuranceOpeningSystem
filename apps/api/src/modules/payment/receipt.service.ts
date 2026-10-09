import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ListReceiptDto } from './dto/list-receipt.dto.js';
import { toReceiptResponse, type ReceiptResponse } from './dto/payment.response.js';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly scope: DataScopeService,
  ) {}

  private scopedWhere(): Prisma.ReceiptWhereInput {
    return { payment: { policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } } } };
  }

  async list(dto: ListReceiptDto): Promise<{ items: ReceiptResponse[]; total: number; page: number; perPage: number }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: Prisma.ReceiptWhereInput = {
      ...this.scopedWhere(),
      ...(dto.invoiceId ? { invoiceId: dto.invoiceId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.policyId ? { payment: { policyId: dto.policyId, policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.txHost.tx.receipt.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { issuedAt: 'desc' } }),
      this.txHost.tx.receipt.count({ where }),
    ]);
    return { items: items.map(toReceiptResponse), total, page, perPage };
  }

  async getById(id: string): Promise<ReceiptResponse> {
    const receipt = await this.txHost.tx.receipt.findFirst({ where: { id, ...this.scopedWhere() } });
    if (!receipt) throw new BusinessException('RECEIPT_NOT_FOUND', 'Receipt not found', 404);
    return toReceiptResponse(receipt);
  }
}
