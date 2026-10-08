import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface CommissionRate {
  id: string;
  insuranceCompanyId: string;
  productId: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  insuranceCompany?: { id: string; code: string; name: string };
  product?: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTerm {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  installments: number;
  intervalMonths: number;
  firstDueDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceProduct {
  id: string;
  insuranceTypeId: string;
  code: string;
  name: string;
  description?: string | null;
  requireDocsOnSubmit: boolean;
  requireDocsOnBind: boolean;
  requireUnderwriting: boolean;
  active: boolean;
  insuranceType: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceCompany {
  id: string;
  code: string;
  name: string;
  taxId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceCoverage {
  id: string;
  productId: string;
  code: string;
  name: string;
  description?: string | null;
  defaultSumInsured?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiskField {
  id: string;
  productId: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  validationRule?: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChecklistMaster {
  id: string;
  productId: string;
  documentType: string;
  isRequired: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  bankName: string;
  branch?: string;
  accountName: string;
  accountNo: string;
}

/** Letterhead printed on customer-facing documents (proposal PDF) */
export interface CompanyProfile {
  nameTh: string;
  nameEn: string | null;
  addressTh: string | null;
  addressEn: string | null;
  taxId: string | null;
  brokerLicenseNo: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  proposalTerms: string | null;
  bankAccounts: BankAccount[];
  hasLogo: boolean;
  configured: boolean;
  updatedAt: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class MasterApi {
  private readonly http = inject(HttpClient);

  // Insurance Types
  listInsuranceTypes() {
    return this.http.get<ApiResponse<InsuranceType[]>>('/api/master/insurance-types');
  }
  createInsuranceType(body: Partial<InsuranceType>) {
    return this.http.post<ApiResponse<InsuranceType>>('/api/master/insurance-types', body);
  }
  updateInsuranceType(id: string, body: Partial<InsuranceType>) {
    return this.http.put<ApiResponse<InsuranceType>>(`/api/master/insurance-types/${id}`, body);
  }

  // Products
  listProducts() {
    return this.http.get<ApiResponse<InsuranceProduct[]>>('/api/master/products');
  }
  createProduct(body: object) {
    return this.http.post<ApiResponse<InsuranceProduct>>('/api/master/products', body);
  }
  updateProduct(id: string, body: object) {
    return this.http.put<ApiResponse<InsuranceProduct>>(`/api/master/products/${id}`, body);
  }

  // Companies
  listCompanies() {
    return this.http.get<ApiResponse<InsuranceCompany[]>>('/api/master/companies');
  }
  createCompany(body: Partial<InsuranceCompany>) {
    return this.http.post<ApiResponse<InsuranceCompany>>('/api/master/companies', body);
  }
  updateCompany(id: string, body: Partial<InsuranceCompany>) {
    return this.http.put<ApiResponse<InsuranceCompany>>(`/api/master/companies/${id}`, body);
  }
  deleteCompany(id: string) {
    return this.http.delete<void>(`/api/master/companies/${id}`);
  }

  // Risk Fields
  listRiskFields(productId: string) {
    return this.http.get<ApiResponse<RiskField[]>>(`/api/master/products/${productId}/risk-fields`);
  }
  createRiskField(body: object) {
    return this.http.post<ApiResponse<RiskField>>('/api/master/risk-fields', body);
  }
  updateRiskField(id: string, body: object) {
    return this.http.put<ApiResponse<RiskField>>(`/api/master/risk-fields/${id}`, body);
  }

  // Coverages
  listCoverages(productId: string) {
    return this.http.get<ApiResponse<InsuranceCoverage[]>>(`/api/master/coverages?productId=${productId}`);
  }
  createCoverage(body: object) {
    return this.http.post<ApiResponse<InsuranceCoverage>>('/api/master/coverages', body);
  }
  updateCoverage(id: string, body: object) {
    return this.http.put<ApiResponse<InsuranceCoverage>>(`/api/master/coverages/${id}`, body);
  }

  // Document Checklists
  listDocumentChecklists(productId: string) {
    return this.http.get<ApiResponse<DocumentChecklistMaster[]>>(`/api/master/document-checklists?productId=${productId}`);
  }
  createDocumentChecklist(body: { productId: string; documentType: string; isRequired?: boolean; sortOrder?: number; active?: boolean }) {
    return this.http.post<ApiResponse<DocumentChecklistMaster>>('/api/master/document-checklists', body);
  }
  updateDocumentChecklist(id: string, body: { isRequired?: boolean; sortOrder?: number; active?: boolean }) {
    return this.http.put<ApiResponse<DocumentChecklistMaster>>(`/api/master/document-checklists/${id}`, body);
  }
  deleteDocumentChecklist(id: string) {
    return this.http.delete<void>(`/api/master/document-checklists/${id}`);
  }

  // Commission Rates
  listCommissionRates(query?: { insuranceCompanyId?: string; productId?: string; activeAt?: string }) {
    let params = new HttpParams();
    if (query?.insuranceCompanyId) params = params.set('insuranceCompanyId', query.insuranceCompanyId);
    if (query?.productId) params = params.set('productId', query.productId);
    if (query?.activeAt) params = params.set('activeAt', query.activeAt);
    return this.http.get<ApiResponse<CommissionRate[]>>('/api/master/commission-rates', { params });
  }
  getCommissionRate(id: string) {
    return this.http.get<ApiResponse<CommissionRate>>(`/api/master/commission-rates/${id}`);
  }
  createCommissionRate(body: { insuranceCompanyId: string; productId: string; rate: string; effectiveFrom: string; effectiveTo?: string }) {
    return this.http.post<ApiResponse<CommissionRate>>('/api/master/commission-rates', body);
  }
  updateCommissionRate(id: string, body: Partial<{ insuranceCompanyId: string; productId: string; rate: string; effectiveFrom: string; effectiveTo?: string | null }>) {
    return this.http.put<ApiResponse<CommissionRate>>(`/api/master/commission-rates/${id}`, body);
  }
  deleteCommissionRate(id: string) {
    return this.http.delete<void>(`/api/master/commission-rates/${id}`);
  }

  // Payment Terms
  listPaymentTerms(query?: { active?: boolean }) {
    let params = new HttpParams();
    if (query?.active !== undefined) params = params.set('active', String(query.active));
    return this.http.get<ApiResponse<PaymentTerm[]>>('/api/master/payment-terms', { params });
  }
  getPaymentTerm(id: string) {
    return this.http.get<ApiResponse<PaymentTerm>>(`/api/master/payment-terms/${id}`);
  }
  createPaymentTerm(body: {
    code: string;
    name: string;
    description?: string | null;
    installments?: number;
    intervalMonths?: number;
    firstDueDays?: number;
    active?: boolean;
  }) {
    return this.http.post<ApiResponse<PaymentTerm>>('/api/master/payment-terms', body);
  }
  updatePaymentTerm(
    id: string,
    body: Partial<{
      code: string;
      name: string;
      description?: string | null;
      installments?: number;
      intervalMonths?: number;
      firstDueDays?: number;
      active?: boolean;
    }>,
  ) {
    return this.http.put<ApiResponse<PaymentTerm>>(`/api/master/payment-terms/${id}`, body);
  }
  deletePaymentTerm(id: string) {
    return this.http.delete<void>(`/api/master/payment-terms/${id}`);
  }

  // Company profile (letterhead)
  getCompanyProfile() {
    return this.http.get<ApiResponse<CompanyProfile>>('/api/settings/company');
  }
  updateCompanyProfile(body: object) {
    return this.http.put<ApiResponse<CompanyProfile>>('/api/settings/company', body);
  }
  getCompanyLogo() {
    return this.http.get('/api/settings/company/logo', { responseType: 'blob' });
  }
  uploadCompanyLogo(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<CompanyProfile>>('/api/settings/company/logo', form);
  }
  removeCompanyLogo() {
    return this.http.delete<ApiResponse<CompanyProfile>>('/api/settings/company/logo');
  }
}
