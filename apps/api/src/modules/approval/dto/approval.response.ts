export interface ApprovalResponse {
  id: string;
  jobId: string;
  proposalId: string;
  approvalType: string;
  requestedById: string | null;
  approverId: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toApprovalResponse(a: {
  id: string;
  jobId: string;
  proposalId: string;
  approvalType: string;
  requestedById: string | null;
  approverId: string | null;
  status: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ApprovalResponse {
  return {
    id: a.id,
    jobId: a.jobId,
    proposalId: a.proposalId,
    approvalType: a.approvalType,
    requestedById: a.requestedById,
    approverId: a.approverId,
    status: a.status,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
