import type { ApprovalViewer } from '../../approval/domain/approval-rules.js';
import { toApprovalResponse, type ApprovalResponse } from '../../approval/dto/approval.response.js';

export type ProposalStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AcceptanceMethod = 'EMAIL' | 'SIGNED_DOCUMENT' | 'LINE' | 'MANUAL';
export type { ApprovalResponse };

export interface ProposalAcceptanceResponse {
  id: string;
  proposalId: string;
  proposalVersion: number;
  acceptedByName: string;
  acceptedAt: string;
  method: AcceptanceMethod;
  ipAddress: string | null;
  evidenceFileId: string | null;
  evidenceFile?: {
    id: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
  } | null;
  remark: string | null;
  recordedById: string | null;
  recordedBy?: {
    id: string;
    username: string;
    fullName?: string;
  } | null;
  createdAt: string;
}

export interface ProposalResponse {
  id: string;
  proposalNo: string;
  jobId: string;
  quotationId: string;
  quotationVersionId: string | null;
  paymentTermId: string | null;
  customerId: string;
  proposalDate: string | null;
  validUntil: string | null;
  status: ProposalStatus;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  coverageSummary: string | null;
  terms: string | null;
  conditions: string | null;
  remark: string | null;
  version: number;
  paymentTerm?: {
    id: string;
    code: string;
    name: string;
    installments: number;
    intervalMonths: number;
    firstDueDays: number;
  } | null;
  latestAcceptance?: ProposalAcceptanceResponse | null;
  acceptances?: ProposalAcceptanceResponse[];
  approvals: ApprovalResponse[];
  createdAt: string;
  updatedAt: string;
}

type ProposalWithRelations = {
  id: string;
  proposalNo: string;
  jobId: string;
  quotationId: string;
  quotationVersionId?: string | null;
  paymentTermId?: string | null;
  customerId: string;
  proposalDate: Date | null;
  validUntil: Date | null;
  status: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  coverageSummary?: string | null;
  terms?: string | null;
  conditions?: string | null;
  remark: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  paymentTerm?: {
    id: string;
    code: string;
    name: string;
    installments: number;
    intervalMonths: number;
    firstDueDays: number;
  } | null;
  approvals?: Array<{
    id: string;
    proposalId: string;
    jobId: string;
    approvalType: string;
    status: string;
    requestedById: string | null;
    requestedAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    reason: string | null;
  }>;
  acceptances?: Array<{
    id: string;
    proposalId: string;
    proposalVersion: number;
    acceptedByName: string;
    acceptedAt: Date;
    method: string;
    ipAddress?: string | null;
    evidenceFileId?: string | null;
    evidenceFile?: {
      id: string;
      originalName: string;
      storedName: string;
      mimeType: string;
      size: number;
    } | null;
    remark?: string | null;
    recordedById?: string | null;
    recordedBy?: {
      id: string;
      username: string;
      fullName?: string | null;
    } | null;
    createdAt: Date;
  }>;
};

export function toProposalResponse(p: ProposalWithRelations, viewer: ApprovalViewer): ProposalResponse {
  const acceptances = (p.acceptances ?? []).map((acc) => ({
    id: acc.id,
    proposalId: acc.proposalId,
    proposalVersion: acc.proposalVersion,
    acceptedByName: acc.acceptedByName,
    acceptedAt: (acc.acceptedAt as Date).toISOString(),
    method: acc.method as AcceptanceMethod,
    ipAddress: acc.ipAddress ?? null,
    evidenceFileId: acc.evidenceFileId ?? null,
    evidenceFile: acc.evidenceFile
      ? {
          id: acc.evidenceFile.id,
          originalName: acc.evidenceFile.originalName,
          storedName: acc.evidenceFile.storedName,
          mimeType: acc.evidenceFile.mimeType,
          size: acc.evidenceFile.size,
        }
      : null,
    remark: acc.remark ?? null,
    recordedById: acc.recordedById ?? null,
    recordedBy: acc.recordedBy
      ? {
          id: acc.recordedBy.id,
          username: acc.recordedBy.username,
          fullName: acc.recordedBy.fullName ?? undefined,
        }
      : null,
    createdAt: (acc.createdAt as Date).toISOString(),
  }));

  return {
    id: p.id,
    proposalNo: p.proposalNo,
    jobId: p.jobId,
    quotationId: p.quotationId,
    quotationVersionId: p.quotationVersionId ?? null,
    paymentTermId: p.paymentTermId ?? null,
    customerId: p.customerId,
    proposalDate: p.proposalDate ? (p.proposalDate as Date).toISOString().slice(0, 10) : null,
    validUntil: p.validUntil ? (p.validUntil as Date).toISOString().slice(0, 10) : null,
    status: p.status as ProposalStatus,
    sentAt: p.sentAt ? (p.sentAt as Date).toISOString() : null,
    acceptedAt: p.acceptedAt ? (p.acceptedAt as Date).toISOString() : null,
    rejectedAt: p.rejectedAt ? (p.rejectedAt as Date).toISOString() : null,
    rejectReason: p.rejectReason,
    coverageSummary: p.coverageSummary ?? null,
    terms: p.terms ?? null,
    conditions: p.conditions ?? null,
    remark: p.remark,
    version: p.version,
    paymentTerm: p.paymentTerm
      ? {
          id: p.paymentTerm.id,
          code: p.paymentTerm.code,
          name: p.paymentTerm.name,
          installments: p.paymentTerm.installments,
          intervalMonths: p.paymentTerm.intervalMonths,
          firstDueDays: p.paymentTerm.firstDueDays,
        }
      : null,
    latestAcceptance: acceptances[0] ?? null,
    acceptances,
    approvals: (p.approvals ?? []).map((a) => toApprovalResponse(a, viewer)),
    createdAt: (p.createdAt as Date).toISOString(),
    updatedAt: (p.updatedAt as Date).toISOString(),
  };
}

