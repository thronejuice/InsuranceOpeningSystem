import type { Prisma, Renewal } from '../../../generated/prisma/client.js';
import { canRenew, computeDefaultRenewalDates } from '../domain/renewal-dates.js';

export const RENEWAL_INCLUDE = {
  previousPolicy: {
    include: {
      insuranceCompany: { select: { name: true } },
      job: {
        select: {
          id: true,
          jobNo: true,
          effectiveDate: true,
          expiryDate: true,
          customer: { select: { customerType: true, firstName: true, lastName: true, companyName: true, customerCode: true } },
          product: { select: { name: true } },
        },
      },
    },
  },
  newJob: { select: { id: true, jobNo: true } },
} satisfies Prisma.RenewalInclude;

export type RenewalWithRelations = Prisma.RenewalGetPayload<{ include: typeof RENEWAL_INCLUDE }>;

export interface RenewalResponse {
  id: string;
  previousPolicyId: string;
  previousPolicyNo: string;
  previousJobId: string;
  previousJobNo: string;
  customerName: string;
  productName: string;
  insuranceCompanyName: string;
  /** Previous policy term (not the renewal target) */
  policyEffectiveDate: string;
  policyExpiryDate: string | null;
  totalPremium: string;
  newJobId: string | null;
  newJobNo: string | null;
  renewalDate: string;
  targetExpiryDate: string;
  status: string;
  assignedTo: string | null;
  remark: string | null;
  /** Dates the renewal job gets when the user does not change them (previous expiry + same term) */
  suggestedEffectiveDate: string;
  suggestedExpiryDate: string;
  /** Backend decides whether the renew button is shown (no PUT/status logic on the client) */
  canRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalReferenceResponse {
  previousPolicyId: string;
  previousPolicyNo: string;
  previousJobId: string;
  previousJobNo: string;
  insuranceCompanyName: string;
  totalPremium: string;
  effectiveDate: string;
  expiryDate: string | null;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function customerName(c: RenewalWithRelations['previousPolicy']['job']['customer']): string {
  return c.customerType === 'INDIVIDUAL'
    ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerCode
    : c.companyName || c.customerCode;
}

export function toRenewalResponse(r: RenewalWithRelations): RenewalResponse {
  const p = r.previousPolicy;
  const suggested = computeDefaultRenewalDates(p.job);
  return {
    id: r.id,
    previousPolicyId: r.previousPolicyId,
    previousPolicyNo: p.policyNo,
    previousJobId: p.job.id,
    previousJobNo: p.job.jobNo,
    customerName: customerName(p.job.customer),
    productName: p.job.product.name,
    insuranceCompanyName: p.insuranceCompany.name,
    policyEffectiveDate: isoDate(p.effectiveDate),
    policyExpiryDate: p.expiryDate ? isoDate(p.expiryDate) : null,
    totalPremium: p.totalPremium.toFixed(2),
    newJobId: r.newJobId,
    newJobNo: r.newJob?.jobNo ?? null,
    renewalDate: isoDate(r.renewalDate),
    targetExpiryDate: isoDate(r.targetExpiryDate),
    status: r.status,
    assignedTo: r.assignedTo,
    remark: r.remark,
    suggestedEffectiveDate: isoDate(suggested.effectiveDate),
    suggestedExpiryDate: isoDate(suggested.expiryDate),
    canRenew: canRenew(r) && p.status === 'ISSUED',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type { Renewal };
