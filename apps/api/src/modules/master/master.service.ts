import { Injectable, Optional } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { BusinessException } from '../../common/errors/business.exception.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { MasterRepository } from './master.repository.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CommissionRateQueryDto,
  CreateApprovalRuleDto,
  CreateBranchDto,
  CreateCommissionRateDto,
  CreateDocumentChecklistDto,
  CreateInsuranceCompanyDto,
  CreateInsuranceCoverageDto,
  CreateInsuranceProductDto,
  CreateInsuranceTypeDto,
  CreateInsurerContactDto,
  UpdateInsurerContactDto,
  CreateRiskFieldDto,
  UpdateApprovalRuleDto,
  UpdateBranchDto,
  UpdateCommissionRateDto,
  UpdateDocumentChecklistDto,
  UpdateInsuranceCompanyDto,
  UpdateInsuranceCoverageDto,
  UpdateInsuranceProductDto,
  UpdateInsuranceTypeDto,
  UpdateRiskFieldDto,
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
  PaymentTermQueryDto,
} from './dto/master.dto.js';

@Injectable()
export class MasterService {
  constructor(
    private readonly repo: MasterRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // ─── Insurance Type ──────────────────────────────────────────────────────

  listInsuranceTypes() {
    return this.repo.findAllInsuranceTypes();
  }

  async getInsuranceType(id: string) {
    const item = await this.repo.findInsuranceTypeById(id);
    if (!item) throw new BusinessException('INSURANCE_TYPE_NOT_FOUND', 'Insurance type not found', 404);
    return item;
  }

  @Transactional()
  async createInsuranceType(dto: CreateInsuranceTypeDto) {
    const existing = await this.repo.findInsuranceTypeByCode(dto.code);
    if (existing) throw new BusinessException('INSURANCE_TYPE_CODE_DUPLICATE', 'Code already exists', 409);
    return this.repo.createInsuranceType({ code: dto.code, name: dto.name, description: dto.description, active: dto.active ?? true });
  }

  @Transactional()
  async updateInsuranceType(id: string, dto: UpdateInsuranceTypeDto) {
    const existing = await this.getInsuranceType(id);
    const updated = await this.repo.updateInsuranceType(id, dto);
    await this.audit?.log({
      action: 'UPDATE_INSURANCE_TYPE',
      entityType: 'INSURANCE_TYPE',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  // ─── Insurance Product ───────────────────────────────────────────────────

  listProducts() {
    return this.repo.findAllProducts();
  }

  async getProduct(id: string) {
    const item = await this.repo.findProductById(id);
    if (!item) throw new BusinessException('PRODUCT_NOT_FOUND', 'Product not found', 404);
    return item;
  }

  @Transactional()
  async createProduct(dto: CreateInsuranceProductDto) {
    const existing = await this.repo.findProductByCode(dto.code);
    if (existing) throw new BusinessException('PRODUCT_CODE_DUPLICATE', 'Code already exists', 409);
    const created = await this.repo.createProduct({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      requireDocsOnSubmit: dto.requireDocsOnSubmit ?? false,
      requireDocsOnBind: dto.requireDocsOnBind ?? false,
      requireUnderwriting: dto.requireUnderwriting ?? false,
      active: dto.active ?? true,
      insuranceType: { connect: { id: dto.insuranceTypeId } },
    });
    await this.audit?.log({
      action: 'CREATE_PRODUCT',
      entityType: 'INSURANCE_PRODUCT',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Transactional()
  async updateProduct(id: string, dto: UpdateInsuranceProductDto) {
    const existing = await this.getProduct(id);
    const updated = await this.repo.updateProduct(id, dto);
    await this.audit?.log({
      action: 'UPDATE_PRODUCT',
      entityType: 'INSURANCE_PRODUCT',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  // ─── Insurance Company ───────────────────────────────────────────────────

  listCompanies() {
    return this.repo.findAllCompanies();
  }

  async getCompany(id: string) {
    const item = await this.repo.findCompanyById(id);
    if (!item) throw new BusinessException('COMPANY_NOT_FOUND', 'Company not found', 404);
    return item;
  }

  @Transactional()
  async createCompany(dto: CreateInsuranceCompanyDto) {
    const existing = await this.repo.findCompanyByCode(dto.code);
    if (existing) throw new BusinessException('COMPANY_CODE_DUPLICATE', 'Code already exists', 409);
    return this.repo.createCompany({
      code: dto.code,
      name: dto.name,
      taxId: dto.taxId,
      contactName: dto.contactName,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      bankAccount: dto.bankAccount,
      status: dto.status,
    });
  }

  @Transactional()
  async updateCompany(id: string, dto: UpdateInsuranceCompanyDto) {
    await this.getCompany(id);
    return this.repo.updateCompany(id, dto);
  }

  @Transactional()
  async deleteCompany(id: string) {
    await this.getCompany(id);
    return this.repo.softDeleteCompany(id);
  }

  // ─── Insurer Contacts & Stats ───────────────────────────────────────────

  async listCompanyContacts(companyId: string, underwritersOnly = false) {
    await this.getCompany(companyId);
    const contacts = await this.repo.findContactsByCompany(companyId);
    return underwritersOnly ? contacts.filter((c) => c.isUnderwriter && c.active) : contacts;
  }

  @Transactional()
  async createCompanyContact(companyId: string, dto: CreateInsurerContactDto) {
    await this.getCompany(companyId);
    if (dto.isPrimary) {
      // Clear other primary flags
      const existing = await this.repo.findContactsByCompany(companyId);
      for (const c of existing) {
        if (c.isPrimary) {
          await this.repo.updateContact(c.id, { isPrimary: false });
        }
      }
    }
    return this.repo.createContact({
      insuranceCompany: { connect: { id: companyId } },
      name: dto.name,
      position: dto.position,
      email: dto.email,
      phone: dto.phone,
      isUnderwriter: dto.isUnderwriter ?? false,
      isPrimary: dto.isPrimary ?? false,
    });
  }

  @Transactional()
  async updateCompanyContact(contactId: string, dto: UpdateInsurerContactDto) {
    const contact = await this.repo.findContactById(contactId);
    if (!contact) throw new BusinessException('CONTACT_NOT_FOUND', 'Contact not found', 404);

    if (dto.isPrimary) {
      const existing = await this.repo.findContactsByCompany(contact.insuranceCompanyId);
      for (const c of existing) {
        if (c.isPrimary && c.id !== contactId) {
          await this.repo.updateContact(c.id, { isPrimary: false });
        }
      }
    }
    return this.repo.updateContact(contactId, dto);
  }

  @Transactional()
  async deleteCompanyContact(contactId: string) {
    const contact = await this.repo.findContactById(contactId);
    if (!contact) throw new BusinessException('CONTACT_NOT_FOUND', 'Contact not found', 404);
    return this.repo.softDeleteContact(contactId);
  }

  // ─── Insurance Coverage ──────────────────────────────────────────────────

  async listCoverages(productId: string) {
    return this.repo.findCoveragesByProduct(productId);
  }

  async getCoverage(id: string) {
    const item = await this.repo.findCoverageById(id);
    if (!item) throw new BusinessException('COVERAGE_NOT_FOUND', 'Coverage not found', 404);
    return item;
  }

  @Transactional()
  createCoverage(dto: CreateInsuranceCoverageDto) {
    return this.repo.createCoverage({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      defaultSumInsured: dto.defaultSumInsured ? dto.defaultSumInsured : undefined,
      active: dto.active ?? true,
      product: { connect: { id: dto.productId } },
    });
  }

  @Transactional()
  async updateCoverage(id: string, dto: UpdateInsuranceCoverageDto) {
    await this.getCoverage(id);
    return this.repo.updateCoverage(id, dto);
  }

  // ─── Risk Field Definition ───────────────────────────────────────────────

  async listRiskFields(productId: string) {
    await this.getProduct(productId);
    return this.repo.findRiskFieldsByProduct(productId);
  }

  async getRiskField(id: string) {
    const item = await this.repo.findRiskFieldById(id);
    if (!item) throw new BusinessException('RISK_FIELD_NOT_FOUND', 'Risk field not found', 404);
    return item;
  }

  @Transactional()
  createRiskField(dto: CreateRiskFieldDto) {
    return this.repo.createRiskField({
      fieldCode: dto.fieldCode,
      fieldName: dto.fieldName,
      fieldType: dto.fieldType,
      isRequired: dto.isRequired ?? false,
      validationRule: dto.validationRule,
      sortOrder: dto.sortOrder ?? 0,
      active: dto.active ?? true,
      product: { connect: { id: dto.productId } },
    });
  }

  @Transactional()
  async updateRiskField(id: string, dto: UpdateRiskFieldDto) {
    await this.getRiskField(id);
    return this.repo.updateRiskField(id, dto);
  }

  // ─── Document Checklist ──────────────────────────────────────────────────

  async listDocumentChecklists(productId: string) {
    return this.repo.findChecklistByProduct(productId);
  }

  async getDocumentChecklist(id: string) {
    const item = await this.repo.findChecklistById(id);
    if (!item) throw new BusinessException('CHECKLIST_NOT_FOUND', 'Document checklist not found', 404);
    return item;
  }

  @Transactional()
  createDocumentChecklist(dto: CreateDocumentChecklistDto) {
    return this.repo.createChecklist({
      documentType: dto.documentType,
      isRequired: dto.isRequired ?? true,
      sortOrder: dto.sortOrder ?? 0,
      active: dto.active ?? true,
      product: { connect: { id: dto.productId } },
    });
  }

  @Transactional()
  async updateDocumentChecklist(id: string, dto: UpdateDocumentChecklistDto) {
    await this.getDocumentChecklist(id);
    return this.repo.updateChecklist(id, dto);
  }

  @Transactional()
  async deleteDocumentChecklist(id: string) {
    await this.getDocumentChecklist(id);
    return this.repo.deleteChecklist(id);
  }

  // ─── Approval Rules ──────────────────────────────────────────────────────

  listApprovalRules() {
    return this.repo.findAllApprovalRules();
  }

  async getApprovalRule(id: string) {
    const item = await this.repo.findApprovalRuleById(id);
    if (!item) throw new BusinessException('APPROVAL_RULE_NOT_FOUND', 'Approval rule not found', 404);
    return item;
  }

  @Transactional()
  createApprovalRule(dto: CreateApprovalRuleDto) {
    return this.repo.createApprovalRule({
      name: dto.name,
      entityType: dto.entityType ?? 'JOB',
      product: dto.productId ? { connect: { id: dto.productId } } : undefined,
      insuranceType: dto.insuranceTypeId ? { connect: { id: dto.insuranceTypeId } } : undefined,
      riskLevel: dto.riskLevel ?? null,
      conditionField: dto.conditionField,
      conditionOperator: dto.conditionOperator,
      thresholdValue: dto.thresholdValue,
      approverRole: dto.approverRole,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Transactional()
  async updateApprovalRule(id: string, dto: UpdateApprovalRuleDto) {
    const existing = await this.getApprovalRule(id);
    const updated = await this.repo.updateApprovalRule(id, dto);
    await this.audit?.log({
      action: 'UPDATE_APPROVAL_RULE',
      entityType: 'APPROVAL_RULE',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  // ─── Branches ────────────────────────────────────────────────────────────

  listBranches() {
    return this.repo.findAllBranches();
  }

  async getBranch(id: string) {
    const item = await this.repo.findBranchById(id);
    if (!item) throw new BusinessException('BRANCH_NOT_FOUND', 'Branch not found', 404);
    return item;
  }

  @Transactional()
  async createBranch(dto: CreateBranchDto) {
    const existing = await this.repo.findBranchByCode(dto.code);
    if (existing) throw new BusinessException('BRANCH_CODE_DUPLICATE', 'Branch code already exists', 409);
    const created = await this.repo.createBranch({
      code: dto.code,
      name: dto.name,
      address: dto.address,
      active: dto.active ?? true,
    });
    await this.audit?.log({
      action: 'CREATE_BRANCH',
      entityType: 'BRANCH',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Transactional()
  async updateBranch(id: string, dto: UpdateBranchDto) {
    const existing = await this.getBranch(id);
    if (dto.code) {
      const dup = await this.repo.findBranchByCode(dto.code);
      if (dup && dup.id !== id) {
        throw new BusinessException('BRANCH_CODE_DUPLICATE', 'Branch code already exists', 409);
      }
    }
    const updated = await this.repo.updateBranch(id, dto);
    await this.audit?.log({
      action: 'UPDATE_BRANCH',
      entityType: 'BRANCH',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  @Transactional()
  async deleteBranch(id: string) {
    const item = await this.getBranch(id);
    if (item._count?.users || item._count?.jobs) {
      throw new BusinessException('BRANCH_IN_USE', 'Cannot delete branch that is assigned to users or jobs', 409);
    }
    const deleted = await this.repo.deleteBranch(id);
    await this.audit?.log({
      action: 'DELETE_BRANCH',
      entityType: 'BRANCH',
      entityId: id,
      before: item,
    });
    return deleted;
  }

  // ─── Commission Rates (Phase 2 Day 11) ───────────────────────────────────

  listCommissionRates(query?: CommissionRateQueryDto) {
    const where: Prisma.CommissionRateWhereInput = {};
    if (query?.insuranceCompanyId) where.insuranceCompanyId = query.insuranceCompanyId;
    if (query?.productId) where.productId = query.productId;
    if (query?.activeAt) {
      const d = new Date(query.activeAt);
      where.effectiveFrom = { lte: d };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: d } }];
    }
    return this.repo.findCommissionRates(where);
  }

  async getCommissionRate(id: string) {
    const item = await this.repo.findCommissionRateById(id);
    if (!item) throw new BusinessException('COMMISSION_RATE_NOT_FOUND', 'Commission rate not found', 404);
    return item;
  }

  findApplicableCommissionRate(insuranceCompanyId: string, productId: string, date: Date = new Date()) {
    return this.repo.findApplicableCommissionRate(insuranceCompanyId, productId, date);
  }

  @Transactional()
  async createCommissionRate(dto: CreateCommissionRateDto) {
    const company = await this.repo.findCompanyById(dto.insuranceCompanyId);
    if (!company) throw new BusinessException('COMPANY_NOT_FOUND', 'Insurance company not found', 404);
    const product = await this.repo.findProductById(dto.productId);
    if (!product) throw new BusinessException('PRODUCT_NOT_FOUND', 'Insurance product not found', 404);

    if (dto.effectiveTo && new Date(dto.effectiveTo) < new Date(dto.effectiveFrom)) {
      throw new BusinessException('INVALID_DATE_RANGE', 'Effective to date must be after effective from date', 422);
    }

    const created = await this.repo.createCommissionRate({
      insuranceCompany: { connect: { id: dto.insuranceCompanyId } },
      product: { connect: { id: dto.productId } },
      rate: dto.rate,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
    });

    await this.audit?.log({
      action: 'CREATE_COMMISSION_RATE',
      entityType: 'COMMISSION_RATE',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Transactional()
  async updateCommissionRate(id: string, dto: UpdateCommissionRateDto) {
    const existing = await this.getCommissionRate(id);

    const fromDate = dto.effectiveFrom ? new Date(dto.effectiveFrom) : existing.effectiveFrom;
    const toDate = dto.effectiveTo !== undefined ? (dto.effectiveTo ? new Date(dto.effectiveTo) : null) : existing.effectiveTo;
    if (toDate && toDate < fromDate) {
      throw new BusinessException('INVALID_DATE_RANGE', 'Effective to date must be after effective from date', 422);
    }

    const data: Prisma.CommissionRateUpdateInput = {};
    if (dto.insuranceCompanyId) data.insuranceCompany = { connect: { id: dto.insuranceCompanyId } };
    if (dto.productId) data.product = { connect: { id: dto.productId } };
    if (dto.rate) data.rate = dto.rate;
    if (dto.effectiveFrom) data.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined) data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    const updated = await this.repo.updateCommissionRate(id, data);
    await this.audit?.log({
      action: 'UPDATE_COMMISSION_RATE',
      entityType: 'COMMISSION_RATE',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  @Transactional()
  async deleteCommissionRate(id: string) {
    const item = await this.getCommissionRate(id);
    const deleted = await this.repo.deleteCommissionRate(id);
    await this.audit?.log({
      action: 'DELETE_COMMISSION_RATE',
      entityType: 'COMMISSION_RATE',
      entityId: id,
      before: item,
    });
    return deleted;
  }

  // ─── Payment Terms (Phase 2 Day 13 / OQ-2) ───────────────────────────────

  listPaymentTerms(query: PaymentTermQueryDto = {}) {
    const where: Prisma.PaymentTermWhereInput = {};
    if (query.active !== undefined) where.active = query.active;
    return this.repo.findPaymentTerms(where);
  }

  async getPaymentTerm(id: string) {
    const item = await this.repo.findPaymentTermById(id);
    if (!item) throw new BusinessException('PAYMENT_TERM_NOT_FOUND', 'Payment term not found', 404);
    return item;
  }

  @Transactional()
  async createPaymentTerm(dto: CreatePaymentTermDto) {
    const existing = await this.repo.findPaymentTermByCode(dto.code);
    if (existing) throw new BusinessException('PAYMENT_TERM_CODE_EXISTS', 'Payment term code already exists', 409);

    const created = await this.repo.createPaymentTerm({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      installments: dto.installments,
      intervalMonths: dto.intervalMonths,
      firstDueDays: dto.firstDueDays,
      active: dto.active ?? true,
    });

    await this.audit?.log({
      action: 'CREATE_PAYMENT_TERM',
      entityType: 'PAYMENT_TERM',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Transactional()
  async updatePaymentTerm(id: string, dto: UpdatePaymentTermDto) {
    const existing = await this.getPaymentTerm(id);
    if (dto.code && dto.code !== existing.code) {
      const codeTaken = await this.repo.findPaymentTermByCode(dto.code);
      if (codeTaken) throw new BusinessException('PAYMENT_TERM_CODE_EXISTS', 'Payment term code already exists', 409);
    }

    const data: Prisma.PaymentTermUpdateInput = {};
    if (dto.code) data.code = dto.code;
    if (dto.name) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.installments !== undefined) data.installments = dto.installments;
    if (dto.intervalMonths !== undefined) data.intervalMonths = dto.intervalMonths;
    if (dto.firstDueDays !== undefined) data.firstDueDays = dto.firstDueDays;
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.repo.updatePaymentTerm(id, data);
    await this.audit?.log({
      action: 'UPDATE_PAYMENT_TERM',
      entityType: 'PAYMENT_TERM',
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  }

  @Transactional()
  async deletePaymentTerm(id: string) {
    const item = await this.getPaymentTerm(id);
    const deleted = await this.repo.deletePaymentTerm(id);
    await this.audit?.log({
      action: 'DELETE_PAYMENT_TERM',
      entityType: 'PAYMENT_TERM',
      entityId: id,
      before: item,
    });
    return deleted;
  }
}


