import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { computeInsurerStats, type InsurerStats } from './domain/stats.js';
import type { AddInsurerProductDto } from './dto/insurer.dto.js';

export interface InsurerProductResponse {
  id: string;
  insuranceCompanyId: string;
  productId: string;
  productCode: string;
  productName: string;
  insuranceTypeName: string | null;
  remark: string | null;
  /** The rate effective today, or null when none is set (set it under Master → commission rates). */
  currentRate: string | null;
  rates: { id: string; rate: string; effectiveFrom: string; effectiveTo: string | null }[];
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class InsurerService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  private async assertInsurer(id: string): Promise<void> {
    const found = await this.db.insuranceCompany.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!found) throw new BusinessException('COMPANY_NOT_FOUND', 'Insurer not found', 404);
  }

  async listProducts(insurerId: string, today: Date = new Date()): Promise<InsurerProductResponse[]> {
    await this.assertInsurer(insurerId);
    const rows = await this.db.insurerProduct.findMany({
      where: { insuranceCompanyId: insurerId, deletedAt: null },
      include: { product: { include: { insuranceType: { select: { name: true } } } } },
      orderBy: { product: { name: 'asc' } },
    });
    const rates = await this.db.commissionRate.findMany({
      where: { insuranceCompanyId: insurerId, deletedAt: null, productId: { in: rows.map((r) => r.productId) } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const todayStr = dateOnly(today);
    const mayViewRates = (this.cls.get('permissions') ?? []).includes('commission.rate_view');

    return rows.map((r) => {
      const own = rates.filter((x) => x.productId === r.productId);
      const current = own.find((x) => dateOnly(x.effectiveFrom) <= todayStr && (!x.effectiveTo || dateOnly(x.effectiveTo) >= todayStr));
      return {
        id: r.id,
        insuranceCompanyId: r.insuranceCompanyId,
        productId: r.productId,
        productCode: r.product.code,
        productName: r.product.name,
        insuranceTypeName: r.product.insuranceType?.name ?? null,
        remark: r.remark,
        currentRate: mayViewRates && current ? current.rate.toFixed(4) : null,
        rates: !mayViewRates ? [] : own.map((x) => ({
          id: x.id,
          rate: x.rate.toFixed(4),
          effectiveFrom: dateOnly(x.effectiveFrom),
          effectiveTo: x.effectiveTo ? dateOnly(x.effectiveTo) : null,
        })),
      };
    });
  }

  @Transactional()
  async addProduct(insurerId: string, dto: AddInsurerProductDto): Promise<InsurerProductResponse> {
    await this.assertInsurer(insurerId);
    const product = await this.db.insuranceProduct.findFirst({ where: { id: dto.productId }, select: { id: true } });
    if (!product) throw new BusinessException('PRODUCT_NOT_FOUND', 'Product not found', 404);

    const existing = await this.db.insurerProduct.findFirst({ where: { insuranceCompanyId: insurerId, productId: dto.productId, deletedAt: null } });
    if (existing) throw new BusinessException('INSURER_PRODUCT_EXISTS', 'The insurer already accepts this product', 409);

    const created = await this.db.insurerProduct.create({
      data: { insuranceCompanyId: insurerId, productId: dto.productId, remark: dto.remark?.trim() || null, createdById: this.cls.get('userId') ?? null },
    });
    await this.audit.log({
      action: 'ADD_INSURER_PRODUCT',
      entityType: 'INSURANCE_COMPANY',
      entityId: insurerId,
      after: { productId: dto.productId, remark: created.remark },
    });
    return (await this.listProducts(insurerId)).find((p) => p.id === created.id)!;
  }

  @Transactional()
  async removeProduct(insurerId: string, productId: string): Promise<void> {
    await this.assertInsurer(insurerId);
    const row = await this.db.insurerProduct.findFirst({ where: { insuranceCompanyId: insurerId, productId, deletedAt: null } });
    if (!row) throw new BusinessException('INSURER_PRODUCT_NOT_FOUND', 'The insurer does not accept this product', 404);
    await this.db.insurerProduct.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      action: 'REMOVE_INSURER_PRODUCT',
      entityType: 'INSURANCE_COMPANY',
      entityId: insurerId,
      before: { productId },
    });
  }

  /** Quotation conversion and issued premium for one insurer (OQ-24). */
  async stats(insurerId: string): Promise<InsurerStats> {
    await this.assertInsurer(insurerId);
    const [quotations, policies] = await Promise.all([
      this.db.quotation.groupBy({ by: ['status'], where: { insuranceCompanyId: insurerId, deletedAt: null }, _count: { _all: true } }),
      this.db.policy.groupBy({ by: ['status'], where: { insuranceCompanyId: insurerId }, _count: { _all: true }, _sum: { totalPremium: true } }),
    ]);
    return computeInsurerStats(
      quotations.map((q) => ({ status: q.status, count: q._count._all })),
      policies.map((p) => ({ status: p.status, count: p._count._all, premium: (p._sum.totalPremium ?? 0).toString() })),
    );
  }
}
