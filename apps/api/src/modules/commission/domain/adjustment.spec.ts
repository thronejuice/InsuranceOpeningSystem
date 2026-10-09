import { describe, expect, it } from 'vitest';
import { checkAdjustmentAmount, computeAdjustment, exceedsOriginalShare } from './adjustment.js';

describe('checkAdjustmentAmount', () => {
  it.each(['100', '-500.00', '+75.5', '0.01', '-0.01', '9999999999999.99'])('accepts %s', (v) => {
    expect(checkAdjustmentAmount(v)).toBe('OK');
  });
  it.each(['0', '0.00', '-0', '+0.0'])('treats %s as zero', (v) => {
    expect(checkAdjustmentAmount(v)).toBe('ZERO');
  });
  it.each(['', 'abc', '1.234', '1,000', '--5', '1e3', ' 5', '99999999999999'])('rejects %j', (v) => {
    expect(checkAdjustmentAmount(v)).toBe('INVALID_FORMAT');
  });
});

describe('computeAdjustment', () => {
  it('positive: WHT is withheld from the extra payout', () => {
    expect(computeAdjustment('500.00', '3')).toEqual({ amount: '500.00', whtAmount: '15.00', netAmount: '485.00' });
  });

  it('negative: the withholding is taken back in proportion, so net stays amount − wht', () => {
    expect(computeAdjustment('-500.00', '3')).toEqual({ amount: '-500.00', whtAmount: '-15.00', netAmount: '-485.00' });
  });

  it('rounds half away from zero symmetrically', () => {
    // 0.50 × 3% = 0.015 → 0.02 ; -0.50 × 3% = -0.015 → -0.02
    expect(computeAdjustment('0.50', '3').whtAmount).toBe('0.02');
    expect(computeAdjustment('-0.50', '3').whtAmount).toBe('-0.02');
  });

  it('uses the given WHT rate, including 0', () => {
    expect(computeAdjustment('-100', '0')).toEqual({ amount: '-100.00', whtAmount: '0.00', netAmount: '-100.00' });
    expect(computeAdjustment('200', '5.5').netAmount).toBe('189.00');
  });
});

describe('exceedsOriginalShare', () => {
  it('never limits positive adjustments', () => {
    expect(exceedsOriginalShare([], '999999', '100.00')).toBe(false);
  });

  it('allows clawing back up to the original share, in total', () => {
    expect(exceedsOriginalShare([], '-100.00', '100.00')).toBe(false);
    expect(exceedsOriginalShare(['-60.00'], '-40.00', '100.00')).toBe(false);
  });

  it('rejects going past it, counting earlier negatives and ignoring positives', () => {
    expect(exceedsOriginalShare([], '-100.01', '100.00')).toBe(true);
    expect(exceedsOriginalShare(['-60.00'], '-40.01', '100.00')).toBe(true);
    expect(exceedsOriginalShare(['-60.00', '-30.00'], '-10.01', '100.00')).toBe(true);
  });
});
