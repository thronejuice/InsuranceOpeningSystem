export type ProposalStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ApprovalResponse {
  id: string;
  proposalId: string;
  jobId: string;
  approvalType: string;
  status: ApprovalStatus;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  reason: string | null;
}

export interface ProposalResponse {
  id: string;
  proposalNo: string;
  jobId: string;
  quotationId: string;
  customerId: string;
  proposalDate: string | null;
  validUntil: string | null;
  status: ProposalStatus;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  remark: string | null;
  version: number;
  approvals: ApprovalResponse[];
  createdAt: string;
  updatedAt: string;
}

type ProposalWithRelations = {
  id: string;
  proposalNo: string;
  jobId: string;
  quotationId: string;
  customerId: string;
  proposalDate: Date | null;
  validUntil: Date | null;
  status: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string | null;
  remark: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  approvals?: Array<{
    id: string;
    proposalId: string;
    jobId: string;
    approvalType: string;
    status: string;
    requestedAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    reason: string | null;
  }>;
};

export function toProposalResponse(p: ProposalWithRelations): ProposalResponse {
  return {
    id: p.id,
    proposalNo: p.proposalNo,
    jobId: p.jobId,
    quotationId: p.quotationId,
    customerId: p.customerId,
    proposalDate: p.proposalDate ? (p.proposalDate as Date).toISOString().slice(0, 10) : null,
    validUntil: p.validUntil ? (p.validUntil as Date).toISOString().slice(0, 10) : null,
    status: p.status as ProposalStatus,
    sentAt: p.sentAt ? (p.sentAt as Date).toISOString() : null,
    acceptedAt: p.acceptedAt ? (p.acceptedAt as Date).toISOString() : null,
    rejectedAt: p.rejectedAt ? (p.rejectedAt as Date).toISOString() : null,
    rejectReason: p.rejectReason,
    remark: p.remark,
    version: p.version,
    approvals: (p.approvals ?? []).map((a) => ({
      id: a.id,
      proposalId: a.proposalId,
      jobId: a.jobId,
      approvalType: a.approvalType,
      status: a.status as ApprovalStatus,
      requestedAt: (a.requestedAt as Date).toISOString(),
      approvedAt: a.approvedAt ? (a.approvedAt as Date).toISOString() : null,
      rejectedAt: a.rejectedAt ? (a.rejectedAt as Date).toISOString() : null,
      reason: a.reason,
    })),
    createdAt: (p.createdAt as Date).toISOString(),
    updatedAt: (p.updatedAt as Date).toISOString(),
  };
}
