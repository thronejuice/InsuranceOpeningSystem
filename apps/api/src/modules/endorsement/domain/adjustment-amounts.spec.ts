import { describe, expect, it } from 'vitest';
import { validateAdjustmentAmounts } from './adjustment-amounts.js';

const base = { type: 'ADDITIONAL_PREMIUM' as const, net: '1000.00', stampDuty: '4.00', vat: '70.28', total: '1074.28' };

describe('validateAdjustmentAmounts', () => {
  it('accepts consistent amounts', () => {
    expect(validateAdjustmentAmounts(base)).toEqual([]);
    expect(validateAdjustmentAmounts({ ...base, type: 'REFUND_PREMIUM' })).toEqual([]);
  });

  it('accepts NO_CHANGE only with zeros', () => {
    const zero = { type: 'NO_CHANGE' as const, net: '0', stampDuty: '0', vat: '0.00', total: '0.00' };
    expect(validateAdjustmentAmounts(zero)).toEqual([]);
    expect(validateAdjustmentAmounts({ ...zero, net: '1.00' })).toHaveLength(1);
  });

  it('rejects a total that does not add up — even by one satang', () => {
    expect(validateAdjustmentAmounts({ ...base, total: '1074.29' })).toContain('Total adjustment must equal net + stamp duty + VAT');
    expect(validateAdjustmentAmounts({ ...base, total: '5000.00' })).toHaveLength(1);
  });

  it('adds exactly (0.1 + 0.2 style float drift does not matter)', () => {
    expect(validateAdjustmentAmounts({ type: 'ADDITIONAL_PREMIUM', net: '0.10', stampDuty: '0.10', vat: '0.10', total: '0.30' })).toEqual([]);
  });

  it('requires a positive net and non-negative stamp duty / VAT for a premium effect', () => {
    expect(validateAdjustmentAmounts({ ...base, net: '0.00', total: '74.28' })).toContain('Net adjustment must be greater than zero');
    expect(validateAdjustmentAmounts({ ...base, stampDuty: '-4.00', total: '1066.28' })).toContain('Stamp duty and VAT cannot be negative');
  });
});
