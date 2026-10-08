export interface CompanyColumn {
  quotationId: string;
  quotationNo: string;
  insuranceCompanyId: string;
  insuranceCompanyName: string;
  status: string;
  validUntil: string | null;
  totalAmount: string;
  netPremium: string;
  stampDuty: string;
  tax: string;
  isLowest?: boolean;
}

export interface CoverageCell {
  sumInsured: string | null;
  deductible: string | null;
  premium: string | null;
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
