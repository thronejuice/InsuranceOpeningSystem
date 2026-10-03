import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
}
