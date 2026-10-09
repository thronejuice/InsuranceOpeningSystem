import { Decimal } from 'decimal.js';

export type PaymentAmountCheck = 'OK' | 'NOT_POSITIVE' | 'EXCEEDS_OUTSTANDING';

/** OQ-4: a payment may never exceed what is still owed on its invoice (no overpay override). */
export function checkPaymentAmount(amount: string, outstanding: string | Decimal): PaymentAmountCheck {
  const value = new Decimal(amount);
  if (value.lessThanOrEqualTo(0)) return 'NOT_POSITIVE';
  if (value.greaterThan(outstanding)) return 'EXCEEDS_OUTSTANDING';
  return 'OK';
}
