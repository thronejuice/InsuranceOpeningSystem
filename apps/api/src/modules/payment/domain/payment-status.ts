/**
 * spec §19.2 — Derive payment status from totals + due date.
 * All amounts are Decimal strings; comparison is done with number conversion
 * (safe because we control the inputs and they are Decimal(15,2) values).
 */

export type PolicyPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface PaymentStatusInput {
  totalPremium: string;   // policy.totalPremium (Decimal string)
  totalPaid: string;      // sum of ACTIVE payments (Decimal string)
  paymentDueDate: Date | null;
  now?: Date;             // injectable for testing
}

export function derivePaymentStatus(input: PaymentStatusInput): PolicyPaymentStatus {
  const now = input.now ?? new Date();
  const totalPremium = parseFloat(input.totalPremium);
  const totalPaid = parseFloat(input.totalPaid);

  if (totalPaid >= totalPremium && totalPremium > 0) {
    return 'PAID';
  }

  const outstanding = totalPremium - totalPaid;
  if (outstanding > 0 && input.paymentDueDate !== null && input.paymentDueDate < now) {
    return 'OVERDUE';
  }

  if (totalPaid > 0) {
    return 'PARTIAL';
  }

  return 'UNPAID';
}
