export type QuotationStatus = 'REQUESTED' | 'RECEIVED' | 'SELECTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface QuotationItemResponse {
  id: string;
  quotationId: string;
  coverageId: string | null;
  coverageName: string;
  sumInsured: string;
  rate: string | null;
  deductible: string | null;
  premium: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationResponse {
  id: string;
  jobId: string;
  insuranceCompanyId: string;
  insuranceCompanyName: string;
  quotationNo: string;
  quotationDate: string | null;
  validUntil: string | null;
  status: QuotationStatus;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalAmount: string;
  remark: string | null;
  version: number;
  requestedById: string | null;
  jobNo: string | null;
  items: QuotationItemResponse[];
  createdAt: string;
  updatedAt: string;
}

type DecimalLike = { toFixed(dp: number): string; toString(): string };

type QuotationWithRelations = {
  id: string;
  jobId: string;
  insuranceCompanyId: string;
  quotationNo: string;
  quotationDate: Date | null;
  validUntil: Date | null;
  status: string;
  grossPremium: DecimalLike;
  discount: DecimalLike;
  netPremium: DecimalLike;
  tax: DecimalLike;
  stampDuty: DecimalLike;
  totalAmount: DecimalLike;
  remark: string | null;
  version: number;
  requestedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  insuranceCompany?: { id: string; name: string } | null;
  job?: { id: string; jobNo: string } | null;
  items?: Array<{
    id: string;
    quotationId: string;
    coverageId: string | null;
    coverageName: string;
    sumInsured: DecimalLike;
    rate: DecimalLike | null;
    deductible: DecimalLike | null;
    premium: DecimalLike;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function toQuotationResponse(q: QuotationWithRelations): QuotationResponse {
  return {
    id: q.id,
    jobId: q.jobId,
    insuranceCompanyId: q.insuranceCompanyId,
    insuranceCompanyName: q.insuranceCompany?.name ?? '',
    quotationNo: q.quotationNo,
    quotationDate: q.quotationDate ? (q.quotationDate as Date).toISOString().slice(0, 10) : null,
    validUntil: q.validUntil ? (q.validUntil as Date).toISOString().slice(0, 10) : null,
    status: q.status as QuotationStatus,
    grossPremium: q.grossPremium.toFixed(2),
    discount: q.discount.toFixed(2),
    netPremium: q.netPremium.toFixed(2),
    tax: q.tax.toFixed(2),
    stampDuty: q.stampDuty.toFixed(2),
    totalAmount: q.totalAmount.toFixed(2),
    remark: q.remark,
    version: q.version,
    requestedById: q.requestedById,
    jobNo: q.job?.jobNo ?? null,
    items: (q.items ?? []).map((item) => ({
      id: item.id,
      quotationId: item.quotationId,
      coverageId: item.coverageId,
      coverageName: item.coverageName,
      sumInsured: item.sumInsured.toFixed(2),
      rate: item.rate?.toFixed(6) ?? null,
      deductible: item.deductible?.toFixed(2) ?? null,
      premium: item.premium.toFixed(2),
      remark: item.remark,
      createdAt: (item.createdAt as Date).toISOString(),
      updatedAt: (item.updatedAt as Date).toISOString(),
    })),
    createdAt: (q.createdAt as Date).toISOString(),
    updatedAt: (q.updatedAt as Date).toISOString(),
  };
}
