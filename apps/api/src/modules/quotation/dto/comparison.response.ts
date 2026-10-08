export interface CompanyColumn {
  quotationId: string;
  quotationNo: string;
  insuranceCompanyId: string;
  insuranceCompanyName: string;
  status: string;
  version?: number;
  quotationDate?: string | null;
  validUntil: string | null;
  grossPremium?: string;
  discount?: string;
  netPremium: string;
  stampDuty: string;
  tax: string;
  totalAmount: string;
  deductible?: string | null;
  commissionRate?: string | null;
  commissionAmount?: string | null;
  exclusion?: string | null;
  specialCondition?: string | null;
  underwriter?: string | null;
  insurerReference?: string | null;
  isLowest?: boolean;
}

export interface CoverageCell {
  sumInsured: string | null;
  rate?: string | null;
  deductible: string | null;
  premium: string | null;
  remark?: string | null;
}

export interface CoverageRow {
  coverageName: string;
  /** Index-aligned with `companies` */
  cells: CoverageCell[];
}

export interface QuotationComparisonResponse {
  jobId: string;
  companies: CompanyColumn[];
  coverages: CoverageRow[];
}
