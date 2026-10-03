import type { Payment } from '../../../generated/prisma/client.js';
import type { PolicyPaymentStatus } from '../domain/payment-status.js';

export type PaymentResponse = Omit<Payment, 'amount'> & { amount: string };

export interface PaymentListResponse {
  payments: PaymentResponse[];
  totalPaid: string;
  paymentStatus: PolicyPaymentStatus;
}
