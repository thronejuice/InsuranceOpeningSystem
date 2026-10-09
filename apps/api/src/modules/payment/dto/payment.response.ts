import type { Payment, Receipt } from '../../../generated/prisma/client.js';
import type { InvoiceResponse } from '../../invoice/dto/invoice.response.js';
import type { PolicyPaymentStatus } from '../domain/payment-status.js';

export interface ReceiptResponse {
  id: string;
  receiptNo: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  status: Receipt['status'];
  issuedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedById: string | null;
}

export type PaymentResponse = Omit<Payment, 'amount'> & { amount: string; receipt: ReceiptResponse | null };

export interface PaymentListResponse {
  payments: PaymentResponse[];
  totalPaid: string;
  paymentStatus: PolicyPaymentStatus;
}

/** Result of recording or cancelling a payment; `invoice` is null only for a legacy V1 policy-level payment. */
export interface InvoicePaymentResponse {
  payment: PaymentResponse;
  invoice: InvoiceResponse | null;
}

export function toReceiptResponse(r: Receipt): ReceiptResponse {
  return {
    id: r.id,
    receiptNo: r.receiptNo,
    paymentId: r.paymentId,
    invoiceId: r.invoiceId,
    amount: r.amount.toString(),
    status: r.status,
    issuedAt: r.issuedAt.toISOString(),
    voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
    voidReason: r.voidReason,
    voidedById: r.voidedById,
  };
}

export function toPaymentResponse(p: Payment & { receipt?: Receipt | null }): PaymentResponse {
  const { receipt, ...rest } = p;
  return { ...rest, amount: p.amount.toString(), receipt: receipt ? toReceiptResponse(receipt) : null };
}
