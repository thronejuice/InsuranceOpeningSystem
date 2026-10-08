export type QuotationStatus = 'REQUESTED' | 'RECEIVED' | 'SELECTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED';

export type QuotationVersionStatus = 'ACTIVE' | 'SUPERSEDED' | 'SELECTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';

export interface QuotationItemResponse {
  id: string;
  quotationId: string;
  quotationVersionId?: string | null;
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

export interface QuotationVersionResponse {
  id: string;
  quotationId: string;
  version: number;
  status: QuotationVersionStatus;
  quotationDate: string | null;
  validUntil: string | null;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalAmount: string;
  commissionRate: string | null;
  commissionAmount: string | null;
  deductible: string | null;
  exclusion: string | null;
  specialCondition: string | null;
  insurerReference: string | null;
  underwriter: string | null;
  attachment: string | null;
  remark: string | null;
  createdById: string | null;
  items: QuotationItemResponse[];
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
  commissionRate?: string | null;
  commissionAmount?: string | null;
  deductible?: string | null;
  exclusion?: string | null;
  specialCondition?: string | null;
  insurerReference?: string | null;
  underwriter?: string | null;
  attachment?: string | null;
  remark: string | null;
  version: number;
  requestedById: string | null;
  jobNo: string | null;
  items: QuotationItemResponse[];
  versions?: QuotationVersionResponse[];
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
    quotationVersionId?: string | null;
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
  versions?: Array<{
    id: string;
    quotationId: string;
    version: number;
    status: string;
    quotationDate: Date | null;
    validUntil: Date | null;
    grossPremium: DecimalLike;
    discount: DecimalLike;
    netPremium: DecimalLike;
    tax: DecimalLike;
    stampDuty: DecimalLike;
    totalAmount: DecimalLike;
    commissionRate: DecimalLike | null;
    commissionAmount: DecimalLike | null;
    deductible: DecimalLike | null;
    exclusion: string | null;
    specialCondition: string | null;
    insurerReference: string | null;
    underwriter: string | null;
    attachment: string | null;
    remark: string | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<{
      id: string;
      quotationId: string;
      quotationVersionId?: string | null;
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
  }>;
};

export function formatDecimal(val: unknown, dp: number): string | null {
  if (val == null) return null;
  if (typeof val === 'number') return val.toFixed(dp);
  if (typeof (val as { toFixed?: unknown }).toFixed === 'function') {
    return (val as { toFixed(n: number): string }).toFixed(dp);
  }
  const n = Number(val);
  return isNaN(n) ? String(val) : n.toFixed(dp);
}

export function formatIso(d: unknown): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string') {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? d : parsed.toISOString();
  }
  return new Date().toISOString();
}

export function formatDateString(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return null;
}

export function toQuotationResponse(q: QuotationWithRelations): QuotationResponse {
  const latestVersion = q.versions?.[0];

  return {
    id: q.id,
    jobId: q.jobId,
    insuranceCompanyId: q.insuranceCompanyId,
    insuranceCompanyName: q.insuranceCompany?.name ?? '',
    quotationNo: q.quotationNo,
    quotationDate: formatDateString(q.quotationDate),
    validUntil: formatDateString(q.validUntil),
    status: q.status as QuotationStatus,
    grossPremium: formatDecimal(q.grossPremium, 2) ?? '0.00',
    discount: formatDecimal(q.discount, 2) ?? '0.00',
    netPremium: formatDecimal(q.netPremium, 2) ?? '0.00',
    tax: formatDecimal(q.tax, 2) ?? '0.00',
    stampDuty: formatDecimal(q.stampDuty, 2) ?? '0.00',
    totalAmount: formatDecimal(q.totalAmount, 2) ?? '0.00',
    commissionRate: formatDecimal(latestVersion?.commissionRate, 4),
    commissionAmount: formatDecimal(latestVersion?.commissionAmount, 2),
    deductible: formatDecimal(latestVersion?.deductible, 2),
    exclusion: latestVersion?.exclusion ?? null,
    specialCondition: latestVersion?.specialCondition ?? null,
    insurerReference: latestVersion?.insurerReference ?? null,
    underwriter: latestVersion?.underwriter ?? null,
    attachment: latestVersion?.attachment ?? null,
    remark: q.remark,
    version: q.version,
    requestedById: q.requestedById,
    jobNo: q.job?.jobNo ?? null,
    items: (q.items ?? []).map((item) => ({
      id: item.id,
      quotationId: item.quotationId,
      quotationVersionId: item.quotationVersionId ?? null,
      coverageId: item.coverageId,
      coverageName: item.coverageName,
      sumInsured: formatDecimal(item.sumInsured, 2) ?? '0.00',
      rate: formatDecimal(item.rate, 6),
      deductible: formatDecimal(item.deductible, 2),
      premium: formatDecimal(item.premium, 2) ?? '0.00',
      remark: item.remark,
      createdAt: formatIso(item.createdAt),
      updatedAt: formatIso(item.updatedAt),
    })),
    versions: q.versions?.map((v) => ({
      id: v.id,
      quotationId: v.quotationId,
      version: v.version,
      status: v.status as QuotationVersionStatus,
      quotationDate: formatDateString(v.quotationDate),
      validUntil: formatDateString(v.validUntil),
      grossPremium: formatDecimal(v.grossPremium, 2) ?? '0.00',
      discount: formatDecimal(v.discount, 2) ?? '0.00',
      netPremium: formatDecimal(v.netPremium, 2) ?? '0.00',
      tax: formatDecimal(v.tax, 2) ?? '0.00',
      stampDuty: formatDecimal(v.stampDuty, 2) ?? '0.00',
      totalAmount: formatDecimal(v.totalAmount, 2) ?? '0.00',
      commissionRate: formatDecimal(v.commissionRate, 4),
      commissionAmount: formatDecimal(v.commissionAmount, 2),
      deductible: formatDecimal(v.deductible, 2),
      exclusion: v.exclusion,
      specialCondition: v.specialCondition,
      insurerReference: v.insurerReference,
      underwriter: v.underwriter,
      attachment: v.attachment,
      remark: v.remark,
      createdById: v.createdById,
      items: (v.items ?? []).map((item) => ({
        id: item.id,
        quotationId: item.quotationId,
        quotationVersionId: item.quotationVersionId ?? null,
        coverageId: item.coverageId,
        coverageName: item.coverageName,
        sumInsured: formatDecimal(item.sumInsured, 2) ?? '0.00',
        rate: formatDecimal(item.rate, 6),
        deductible: formatDecimal(item.deductible, 2),
        premium: formatDecimal(item.premium, 2) ?? '0.00',
        remark: item.remark,
        createdAt: formatIso(item.createdAt),
        updatedAt: formatIso(item.updatedAt),
      })),
      createdAt: formatIso(v.createdAt),
      updatedAt: formatIso(v.updatedAt),
    })),
    createdAt: formatIso(q.createdAt),
    updatedAt: formatIso(q.updatedAt),
  };
}
