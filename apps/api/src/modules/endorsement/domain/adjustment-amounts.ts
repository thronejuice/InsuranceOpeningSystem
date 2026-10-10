import { Decimal } from 'decimal.js';

export interface AdjustmentAmountsInput {
  type: 'NO_CHANGE' | 'ADDITIONAL_PREMIUM' | 'REFUND_PREMIUM';
  net: string;
  stampDuty: string;
  vat: string;
  total: string;
}

/**
 * An endorsement's money must be internally consistent before it can bill or refund anyone:
 * no premium effect → all zero; otherwise net > 0, stamp duty and VAT ≥ 0 and total = net + stamp duty + VAT exactly.
 * Returns the problems found (empty = valid). Amounts are decimal strings, compared with decimal.js.
 */
export function validateAdjustmentAmounts(input: AdjustmentAmountsInput): string[] {
  const net = new Decimal(input.net);
  const stamp = new Decimal(input.stampDuty);
  const vat = new Decimal(input.vat);
  const total = new Decimal(input.total);
  const problems: string[] = [];

  if (input.type === 'NO_CHANGE') {
    if (!net.isZero() || !stamp.isZero() || !vat.isZero() || !total.isZero()) {
      problems.push('A NO_CHANGE endorsement must not carry any premium amounts');
    }
    return problems;
  }
  if (!net.gt(0)) problems.push('Net adjustment must be greater than zero');
  if (stamp.lt(0) || vat.lt(0)) problems.push('Stamp duty and VAT cannot be negative');
  if (!total.eq(net.plus(stamp).plus(vat))) problems.push('Total adjustment must equal net + stamp duty + VAT');
  return problems;
}
