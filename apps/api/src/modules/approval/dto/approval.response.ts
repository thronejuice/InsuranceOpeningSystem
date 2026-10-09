import { canDecideApproval, type ApprovalViewer } from '../domain/approval-rules.js';

export interface ApprovalResponse {
  id: string;
  jobId: string;
  jobNo?: string;
  customerName?: string;
  totalPremium?: string;
  proposalId: string;
  approvalType: string;
  requestedById: string | null;
  approverId: string | null;
  status: string;
  reason: string | null;
  rejectReason?: string | null;
  comment?: string | null;
  resubmittedAt?: string | null;
  resubmittedById?: string | null;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Server-computed: current user may approve/reject (pending, has permission, not the requester, role priority >= required). */
  canDecide: boolean;
}

export function toApprovalResponse(
  a: {
    id: string;
    jobId: string;
    proposalId: string;
    approvalType: string;
    requestedById: string | null;
    approverId?: string | null;
    status: string;
    reason: string | null;
    rejectReason?: string | null;
    comment?: string | null;
    resubmittedAt?: Date | null;
    resubmittedById?: string | null;
    requestedAt?: Date | null;
    approvedAt?: Date | null;
    rejectedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    job?: {
      jobNo?: string;
      customer?: {
        firstName?: string | null;
        lastName?: string | null;
        companyName?: string | null;
        customerCode?: string;
        customerType?: string;
      } | null;
    } | null;
    proposal?: {
      quotation?: {
        totalAmount?: { toFixed(n: number): string } | null;
      } | null;
    } | null;
  },
  viewer: ApprovalViewer,
): ApprovalResponse {
  const customer = a.job?.customer;
  const customerName = customer
    ? customer.customerType === 'INDIVIDUAL'
      ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.customerCode
      : customer.companyName || customer.customerCode
    : undefined;

  const totalPremium = a.proposal?.quotation?.totalAmount
    ? (a.proposal.quotation.totalAmount as { toFixed(n: number): string }).toFixed(2)
    : undefined;

  const now = new Date().toISOString();
  return {
    id: a.id,
    jobId: a.jobId,
    jobNo: a.job?.jobNo,
    customerName,
    totalPremium,
    proposalId: a.proposalId,
    approvalType: a.approvalType,
    requestedById: a.requestedById,
    approverId: a.approverId ?? null,
    status: a.status,
    reason: a.reason,
    rejectReason: a.rejectReason ?? null,
    comment: a.comment ?? null,
    resubmittedAt: a.resubmittedAt ? (a.resubmittedAt as Date).toISOString() : null,
    resubmittedById: a.resubmittedById ?? null,
    requestedAt: a.requestedAt ? (a.requestedAt as Date).toISOString() : (a.createdAt ? (a.createdAt as Date).toISOString() : now),
    approvedAt: a.approvedAt ? (a.approvedAt as Date).toISOString() : null,
    rejectedAt: a.rejectedAt ? (a.rejectedAt as Date).toISOString() : null,
    createdAt: a.createdAt ? (a.createdAt as Date).toISOString() : now,
    updatedAt: a.updatedAt ? (a.updatedAt as Date).toISOString() : now,
    canDecide: canDecideApproval(a, viewer),
  };
}
