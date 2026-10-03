import { computeQuotation, autoCalc } from './quotation-calc.js';
import { Decimal } from 'decimal.js';

describe('autoCalc', () => {
  it('calculates stampDuty as ceil(net × 0.004)', () => {
    const { stampDuty } = autoCalc(new Decimal('10000'));
    expect(stampDuty.toString()).toBe('40');
  });

  it('rounds up fractional stampDuty', () => {
    // 10001 × 0.004 = 40.004 → ceil = 41
    const { stampDuty } = autoCalc(new Decimal('10001'));
    expect(stampDuty.toString()).toBe('41');
  });

  it('calculates VAT as (net + stampDuty) × 0.07 to 2dp', () => {
    const { stampDuty, tax } = autoCalc(new Decimal('10000'));
    // (10000 + 40) × 0.07 = 10040 × 0.07 = 702.80
    expect(tax.toFixed(2)).toBe('702.80');
  });
});

describe('computeQuotation', () => {
  it('computes correct total for simple case', () => {
    const result = computeQuotation({ gross: '10000', discount: '0' });
    expect(result.net).toBe('10000.00');
    expect(result.stampDuty).toBe('40.00');
    expect(result.tax).toBe('702.80');
    expect(result.total).toBe('10742.80');
  });

  it('handles discount correctly', () => {
    const result = computeQuotation({ gross: '10000', discount: '500' });
    // net = 9500; stampDuty = ceil(9500×0.004) = ceil(38) = 38; tax = 9538×0.07 = 667.66
    expect(result.net).toBe('9500.00');
    expect(result.stampDuty).toBe('38.00');
    expect(result.tax).toBe('667.66');
    expect(result.total).toBe('10205.66');
  });

  it('avoids 0.1+0.2 float precision issue', () => {
    // 0.1 + 0.2 in JS float = 0.30000000000000004; Decimal keeps it exact
    const result = computeQuotation({ gross: '0.30', discount: '0.20' });
    expect(result.net).toBe('0.10');
  });

  it('accepts manual stampDuty and tax overrides', () => {
    const result = computeQuotation({ gross: '10000', discount: '0', stampDuty: '50', tax: '800' });
    expect(result.stampDuty).toBe('50.00');
    expect(result.tax).toBe('800.00');
    expect(result.total).toBe('10850.00');
  });

  it('throws when total is negative', () => {
    expect(() =>
      computeQuotation({ gross: '100', discount: '0', stampDuty: '0', tax: '-200' }),
    ).toThrow('QUOTATION_TOTAL_NEGATIVE');
  });
});
