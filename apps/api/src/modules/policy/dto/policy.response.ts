interface PolicyCoverageRow {
  id: string;
  coverageId: string | null;
  coverageName: string;
  sumInsured: string;
  rate: string | null;
  deductible: string | null;
  premium: string;
}

export interface BindingResponse {
  id: string;
  jobId: string;
  quotationId: string;
  bindingDate: string;
  effectiveDate: string;
  expiryDate: string | null;
  remark: string | null;
  createdAt: string;
}

export interface PolicyResponse {
  id: string;
  policyNo: string;
  jobId: string;
  quotationId: string;
  insuranceCompanyId: string;
  policyType: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  sumInsured: string | null;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalPremium: string;
  status: string;
  paymentDueDate: string | null;
  issuedAt: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  coverages: PolicyCoverageRow[];
}

export interface PreconditionCheck {
  code: string;
  label: string;
  met: boolean;
  details?: string;
}

export function toBindingResponse(b: {
  id: string;
  jobId: string;
  quotationId: string;
  bindingDate: Date;
  effectiveDate: Date;
  expiryDate: Date | null;
  remark: string | null;
  createdAt: Date;
}): BindingResponse {
  return {
    id: b.id,
    jobId: b.jobId,
    quotationId: b.quotationId,
    bindingDate: (b.bindingDate as Date).toISOString().slice(0, 10),
    effectiveDate: (b.effectiveDate as Date).toISOString().slice(0, 10),
    expiryDate: b.expiryDate ? (b.expiryDate as Date).toISOString().slice(0, 10) : null,
    remark: b.remark,
    createdAt: b.createdAt.toISOString(),
  };
}

export function toPolicyResponse(p: {
  id: string;
  policyNo: string;
  jobId: string;
  quotationId: string;
  insuranceCompanyId: string;
  policyType: string | null;
  effectiveDate: Date;
  expiryDate: Date | null;
  sumInsured: { toString(): string } | null;
  grossPremium: { toString(): string };
  discount: { toString(): string };
  netPremium: { toString(): string };
  tax: { toString(): string };
  stampDuty: { toString(): string };
  totalPremium: { toString(): string };
  status: string;
  paymentDueDate: Date | null;
  issuedAt: Date | null;
  remark: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  coverages: Array<{
    id: string;
    coverageId: string | null;
    coverageName: string;
    sumInsured: { toString(): string };
    rate: { toString(): string } | null;
    deductible: { toString(): string } | null;
    premium: { toString(): string };
  }>;
}): PolicyResponse {
  return {
    id: p.id,
    policyNo: p.policyNo,
    jobId: p.jobId,
    quotationId: p.quotationId,
    insuranceCompanyId: p.insuranceCompanyId,
    policyType: p.policyType,
    effectiveDate: (p.effectiveDate as Date).toISOString().slice(0, 10),
    expiryDate: p.expiryDate ? (p.expiryDate as Date).toISOString().slice(0, 10) : null,
    sumInsured: p.sumInsured ? p.sumInsured.toString() : null,
    grossPremium: p.grossPremium.toString(),
    discount: p.discount.toString(),
    netPremium: p.netPremium.toString(),
    tax: p.tax.toString(),
    stampDuty: p.stampDuty.toString(),
    totalPremium: p.totalPremium.toString(),
    status: p.status,
    paymentDueDate: p.paymentDueDate ? (p.paymentDueDate as Date).toISOString().slice(0, 10) : null,
    issuedAt: p.issuedAt ? p.issuedAt.toISOString() : null,
    remark: p.remark,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    coverages: p.coverages.map((c) => ({
      id: c.id,
      coverageId: c.coverageId,
      coverageName: c.coverageName,
      sumInsured: c.sumInsured.toString(),
      rate: c.rate ? c.rate.toString() : null,
      deductible: c.deductible ? c.deductible.toString() : null,
      premium: c.premium.toString(),
    })),
  };
}
