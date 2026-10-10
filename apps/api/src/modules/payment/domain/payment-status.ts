/**
 * spec §19.2 — Derive payment status from totals + due date.
 * All amounts are Decimal strings and are compared with decimal.js (never floats).
 */
import { Decimal } from 'decimal.js';

export type PolicyPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'REFUNDED';

export interface PaymentStatusInput {
  totalPremium: string;   // policy.totalPremium (Decimal string)
  totalPaid: string;      // sum of ACTIVE payments (Decimal string)
  paymentDueDate: Date | null;
  totalRefunded?: string; // sum of PROCESSED refunds (Decimal string)
  now?: Date;             // injectable for testing
}

export function derivePaymentStatus(input: PaymentStatusInput): PolicyPaymentStatus {
  const now = input.now ?? new Date();
  const totalPremium = new Decimal(input.totalPremium);
  const totalPaid = new Decimal(input.totalPaid);
  const totalRefunded = new Decimal(input.totalRefunded ?? '0');

  // D-16: When total refund processed reaches or exceeds paid amount (and paid > 0) -> REFUNDED
  if (totalRefunded.gt(0) && totalRefunded.gte(totalPaid) && totalPaid.gt(0)) {
    return 'REFUNDED';
  }

  if (totalPaid.gte(totalPremium) && totalPremium.gt(0)) {
    return 'PAID';
  }

  const outstanding = totalPremium.minus(totalPaid);
  if (outstanding.gt(0) && input.paymentDueDate !== null && input.paymentDueDate < now) {
    return 'OVERDUE';
  }

  if (totalPaid.gt(0)) {
    return 'PARTIAL';
  }

  return 'UNPAID';
}

