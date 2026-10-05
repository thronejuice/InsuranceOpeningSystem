import { canDecideApproval, type ApprovalViewer } from '../domain/approval-rules.js';

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
  /** Server-computed: current user may approve/reject (pending, has permission, not the requester). */
  canDecide: boolean;
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
}, viewer: ApprovalViewer): ApprovalResponse {
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
    canDecide: canDecideApproval(a, viewer),
  };
}
