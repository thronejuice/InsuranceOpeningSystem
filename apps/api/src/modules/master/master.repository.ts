import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class MasterRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  // ─── Insurance Type ──────────────────────────────────────────────────────

  findAllInsuranceTypes() {
    return this.db.insuranceType.findMany({ orderBy: { code: 'asc' } });
  }

  findInsuranceTypeById(id: string) {
    return this.db.insuranceType.findUnique({ where: { id } });
  }

  findInsuranceTypeByCode(code: string) {
    return this.db.insuranceType.findUnique({ where: { code } });
  }

  createInsuranceType(data: Prisma.InsuranceTypeCreateInput) {
    return this.db.insuranceType.create({ data });
  }

  updateInsuranceType(id: string, data: Prisma.InsuranceTypeUpdateInput) {
    return this.db.insuranceType.update({ where: { id }, data });
  }

  // ─── Insurance Product ───────────────────────────────────────────────────

  findAllProducts(active?: boolean) {
    const where = active !== undefined ? { active } : {};
    return this.db.insuranceProduct.findMany({
      where,
      include: { insuranceType: true },
      orderBy: { code: 'asc' },
    });
  }

  findProductById(id: string) {
    return this.db.insuranceProduct.findUnique({
      where: { id },
      include: { insuranceType: true },
    });
  }

  findProductByCode(code: string) {
    return this.db.insuranceProduct.findUnique({ where: { code } });
  }

  createProduct(data: Prisma.InsuranceProductCreateInput) {
    return this.db.insuranceProduct.create({ data, include: { insuranceType: true } });
  }

  updateProduct(id: string, data: Prisma.InsuranceProductUpdateInput) {
    return this.db.insuranceProduct.update({ where: { id }, data, include: { insuranceType: true } });
  }

  // ─── Insurance Company ───────────────────────────────────────────────────

  findAllCompanies() {
    return this.db.insuranceCompany.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findCompanyById(id: string) {
    return this.db.insuranceCompany.findFirst({ where: { id, deletedAt: null } });
  }

  findCompanyByCode(code: string) {
    return this.db.insuranceCompany.findFirst({ where: { code, deletedAt: null } });
  }

  createCompany(data: Prisma.InsuranceCompanyCreateInput) {
    return this.db.insuranceCompany.create({ data });
  }

  updateCompany(id: string, data: Prisma.InsuranceCompanyUpdateInput) {
    return this.db.insuranceCompany.update({ where: { id }, data });
  }

  softDeleteCompany(id: string) {
    return this.db.insuranceCompany.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Insurance Coverage ──────────────────────────────────────────────────

  findCoveragesByProduct(productId: string) {
    return this.db.insuranceCoverage.findMany({
      where: { productId },
      orderBy: { code: 'asc' },
    });
  }

  findCoverageById(id: string) {
    return this.db.insuranceCoverage.findUnique({ where: { id } });
  }

  createCoverage(data: Prisma.InsuranceCoverageCreateInput) {
    return this.db.insuranceCoverage.create({ data });
  }

  updateCoverage(id: string, data: Prisma.InsuranceCoverageUpdateInput) {
    return this.db.insuranceCoverage.update({ where: { id }, data });
  }

  // ─── Risk Field Definition ───────────────────────────────────────────────

  findRiskFieldsByProduct(productId: string) {
    return this.db.riskFieldDefinition.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findRiskFieldById(id: string) {
    return this.db.riskFieldDefinition.findUnique({ where: { id } });
  }

  createRiskField(data: Prisma.RiskFieldDefinitionCreateInput) {
    return this.db.riskFieldDefinition.create({ data });
  }

  updateRiskField(id: string, data: Prisma.RiskFieldDefinitionUpdateInput) {
    return this.db.riskFieldDefinition.update({ where: { id }, data });
  }

  // ─── Document Checklist ──────────────────────────────────────────────────

  findChecklistByProduct(productId: string) {
    return this.db.documentChecklist.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findChecklistById(id: string) {
    return this.db.documentChecklist.findUnique({ where: { id } });
  }

  createChecklist(data: Prisma.DocumentChecklistCreateInput) {
    return this.db.documentChecklist.create({ data });
  }

  updateChecklist(id: string, data: Prisma.DocumentChecklistUpdateInput) {
    return this.db.documentChecklist.update({ where: { id }, data });
  }

  // ─── Approval Rules ──────────────────────────────────────────────────────

  findAllApprovalRules() {
    return this.db.approvalRule.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  findApprovalRuleById(id: string) {
    return this.db.approvalRule.findUnique({ where: { id } });
  }

  createApprovalRule(data: Prisma.ApprovalRuleCreateInput) {
    return this.db.approvalRule.create({ data });
  }

  updateApprovalRule(id: string, data: Prisma.ApprovalRuleUpdateInput) {
    return this.db.approvalRule.update({ where: { id }, data });
  }
}
