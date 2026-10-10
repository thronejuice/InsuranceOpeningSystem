import { PaymentMethod, RefundStatus } from '../../../generated/prisma/enums.js';

export interface RefundResponse {
  id: string;
  refundNo: string;
  creditNoteId: string;
  creditNoteNo?: string;
  policyId?: string;
  policyNo?: string;
  customerId?: string;
  amount: string;
  status: RefundStatus;
  reason: string | null;
  rejectionReason: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  requestedAt: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  processedById: string | null;
  processedByName: string | null;
  processedAt: string | null;
  paymentMethod: PaymentMethod | null;
  bank: string | null;
  referenceNo: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toRefundResponse(r: {
  id: string;
  refundNo: string;
  creditNoteId: string;
  amount: { toString(): string };
  status: RefundStatus;
  reason?: string | null;
  rejectionReason?: string | null;
  requestedById?: string | null;
  requestedAt: Date;
  approvedById?: string | null;
  approvedAt?: Date | null;
  processedById?: string | null;
  processedAt?: Date | null;
  paymentMethod?: PaymentMethod | null;
  bank?: string | null;
  referenceNo?: string | null;
  attachmentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  creditNote?: {
    id: string;
    invoiceNo: string;
    policyId: string;
    customerId: string;
    policy?: {
      id: string;
      policyNo: string;
    };
  } | null;
  attachment?: {
    id: string;
    originalName: string;
  } | null;
  requestedBy?: {
    id: string;
    fullName: string;
  } | null;
  approvedBy?: {
    id: string;
    fullName: string;
  } | null;
  processedBy?: {
    id: string;
    fullName: string;
  } | null;
}): RefundResponse {
  return {
    id: r.id,
    refundNo: r.refundNo,
    creditNoteId: r.creditNoteId,
    creditNoteNo: r.creditNote?.invoiceNo,
    policyId: r.creditNote?.policyId,
    policyNo: r.creditNote?.policy?.policyNo,
    customerId: r.creditNote?.customerId,
    amount: r.amount.toString(),
    status: r.status,
    reason: r.reason ?? null,
    rejectionReason: r.rejectionReason ?? null,
    requestedById: r.requestedById ?? null,
    requestedByName: r.requestedBy?.fullName ?? null,
    requestedAt: r.requestedAt.toISOString(),
    approvedById: r.approvedById ?? null,
    approvedByName: r.approvedBy?.fullName ?? null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    processedById: r.processedById ?? null,
    processedByName: r.processedBy?.fullName ?? null,
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
    paymentMethod: r.paymentMethod ?? null,
    bank: r.bank ?? null,
    referenceNo: r.referenceNo ?? null,
    attachmentId: r.attachmentId ?? null,
    attachmentName: r.attachment?.originalName ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

