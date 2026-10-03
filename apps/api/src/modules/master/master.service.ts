import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { BusinessException } from '../../common/errors/business.exception.js';
import { MasterRepository } from './master.repository.js';
import type {
  CreateApprovalRuleDto,
  CreateDocumentChecklistDto,
  CreateInsuranceCompanyDto,
  CreateInsuranceCoverageDto,
  CreateInsuranceProductDto,
  CreateInsuranceTypeDto,
  CreateRiskFieldDto,
  UpdateApprovalRuleDto,
  UpdateDocumentChecklistDto,
  UpdateInsuranceCompanyDto,
  UpdateInsuranceCoverageDto,
  UpdateInsuranceProductDto,
  UpdateInsuranceTypeDto,
  UpdateRiskFieldDto,
} from './dto/master.dto.js';

@Injectable()
export class MasterService {
  constructor(private readonly repo: MasterRepository) {}

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
    await this.getInsuranceType(id);
    return this.repo.updateInsuranceType(id, dto);
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
    return this.repo.createProduct({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      requireDocsOnSubmit: dto.requireDocsOnSubmit ?? false,
      requireDocsOnBind: dto.requireDocsOnBind ?? false,
      active: dto.active ?? true,
      insuranceType: { connect: { id: dto.insuranceTypeId } },
    });
  }

  @Transactional()
  async updateProduct(id: string, dto: UpdateInsuranceProductDto) {
    await this.getProduct(id);
    return this.repo.updateProduct(id, dto);
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
    await this.getApprovalRule(id);
    return this.repo.updateApprovalRule(id, dto);
  }
}
