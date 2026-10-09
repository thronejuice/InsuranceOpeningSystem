import { Decimal } from 'decimal.js';

/** Signed money with at most 2 decimals, e.g. "-500.00", "120", "+75.5". */
const SIGNED_MONEY_RE = /^[+-]?\d{1,13}(\.\d{1,2})?$/;

export type AdjustmentAmountCheck = 'OK' | 'INVALID_FORMAT' | 'ZERO';

export function checkAdjustmentAmount(amount: string): AdjustmentAmountCheck {
  if (!SIGNED_MONEY_RE.test(amount)) return 'INVALID_FORMAT';
  return new Decimal(amount).isZero() ? 'ZERO' : 'OK';
}

export interface AdjustmentAmounts {
  amount: string;
  whtAmount: string;
  netAmount: string;
}

/**
 * Same shape as a commission row: `amount` is before WHT, WHT uses the original row's rate, and a
 * negative adjustment carries a negative WHT (the withholding is taken back in proportion).
 */
export function computeAdjustment(amount: string, whtPct: string): AdjustmentAmounts {
  const value = new Decimal(amount);
  const wht = value.mul(whtPct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    amount: value.toFixed(2),
    whtAmount: wht.toFixed(2),
    netAmount: value.minus(wht).toFixed(2),
  };
}

/**
 * You cannot claw back more than the row was ever worth: all negative adjustments on one commission
 * together may not exceed its original share. Positive adjustments are not bounded.
 */
export function exceedsOriginalShare(existingNegatives: string[], newAmount: string, originalShare: string): boolean {
  const next = new Decimal(newAmount);
  if (next.greaterThanOrEqualTo(0)) return false;
  const clawedBack = existingNegatives.reduce((sum, a) => sum.plus(new Decimal(a).abs()), new Decimal(0));
  return clawedBack.plus(next.abs()).greaterThan(originalShare);
}
