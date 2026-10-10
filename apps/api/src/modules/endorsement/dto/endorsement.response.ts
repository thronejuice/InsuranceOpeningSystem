import type { Endorsement, Policy, User, Document } from '../../../generated/prisma/client.js';
import type { EndorsementStatus, EndorsementType, PremiumAdjustmentType } from '../../../generated/prisma/enums.js';

export interface EndorsementResponse {
  id: string;
  endorsementNo: string;
  policyId: string;
  policyNo?: string;
  type: EndorsementType;
  status: EndorsementStatus;
  effectiveDate: string;
  changes: {
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  premiumAdjustmentType: PremiumAdjustmentType;
  netAdjustment: string;
  stampDuty: string;
  vat: string;
  totalAdjustment: string;
  remark: string | null;
  rejectionReason: string | null;
  insurerDocumentId: string | null;
  insurerDocumentName?: string | null;
  requestedById: string | null;
  requestedByName?: string | null;
  requestedAt: string | null;
  reviewedById: string | null;
  reviewedByName?: string | null;
  reviewedAt: string | null;
  approvedById: string | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  issuedById: string | null;
  issuedByName?: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toEndorsementResponse(
  e: Endorsement & {
    policy?: Pick<Policy, 'id' | 'policyNo'> | null;
    insurerDocument?: Pick<Document, 'id' | 'originalName'> | null;
    requestedBy?: Pick<User, 'id' | 'fullName'> | null;
    reviewedBy?: Pick<User, 'id' | 'fullName'> | null;
    approvedBy?: Pick<User, 'id' | 'fullName'> | null;
    issuedBy?: Pick<User, 'id' | 'fullName'> | null;
  },
): EndorsementResponse {
  return {
    id: e.id,
    endorsementNo: e.endorsementNo,
    policyId: e.policyId,
    policyNo: e.policy?.policyNo,
    type: e.type,
    status: e.status,
    effectiveDate: e.effectiveDate instanceof Date ? e.effectiveDate.toISOString().slice(0, 10) : String(e.effectiveDate),
    changes: e.changes as { before?: Record<string, unknown>; after: Record<string, unknown> },
    premiumAdjustmentType: e.premiumAdjustmentType,
    netAdjustment: e.netAdjustment.toString(),
    stampDuty: e.stampDuty.toString(),
    vat: e.vat.toString(),
    totalAdjustment: e.totalAdjustment.toString(),
    remark: e.remark,
    rejectionReason: e.rejectionReason,
    insurerDocumentId: e.insurerDocumentId,
    insurerDocumentName: e.insurerDocument?.originalName,
    requestedById: e.requestedById,
    requestedByName: e.requestedBy?.fullName,
    requestedAt: e.requestedAt ? e.requestedAt.toISOString() : null,
    reviewedById: e.reviewedById,
    reviewedByName: e.reviewedBy?.fullName,
    reviewedAt: e.reviewedAt ? e.reviewedAt.toISOString() : null,
    approvedById: e.approvedById,
    approvedByName: e.approvedBy?.fullName,
    approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    issuedById: e.issuedById,
    issuedByName: e.issuedBy?.fullName,
    issuedAt: e.issuedAt ? e.issuedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

