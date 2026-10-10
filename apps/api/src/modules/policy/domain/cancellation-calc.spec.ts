import { describe, expect, it } from 'vitest';
import { calculateCancellationRefund } from './cancellation-calc.js';

describe('Policy Cancellation Calculation domain functions', () => {
  it('calculates short-rate refund correctly for 45 days used', () => {
    // 45 days: 31-45 days = 30% retention -> 70% refund
    const result = calculateCancellationRefund({
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      cancelEffectiveDate: '2026-02-15', // 45 days
      annualNetPremium: '10000.00',
      method: 'SHORT_RATE',
    });

    expect(result.daysUsed).toBe(45);
    expect(result.retentionPercent.toNumber()).toBe(30);
    expect(result.refundPercent.toNumber()).toBe(70);
    expect(result.refundNet.toNumber()).toBe(7000);
    // Stamp duty: ceil(7000 * 0.004) = 28
    expect(result.stampDuty.toNumber()).toBe(28);
    // VAT: round2((7000 + 28) * 0.07) = 491.96
    expect(result.vat.toNumber()).toBe(491.96);
    expect(result.totalRefund.toNumber()).toBe(7519.96);
  });

  it('calculates short-rate 0 days used as 100% refund', () => {
    const result = calculateCancellationRefund({
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      cancelEffectiveDate: '2026-01-01',
      annualNetPremium: '10000.00',
    });

    expect(result.daysUsed).toBe(0);
    expect(result.retentionPercent.toNumber()).toBe(0);
    expect(result.refundPercent.toNumber()).toBe(100);
    expect(result.refundNet.toNumber()).toBe(10000);
  });

  it('calculates pro-rata cancellation correctly', () => {
    const result = calculateCancellationRefund({
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      cancelEffectiveDate: '2026-07-02', // 182 days used, 183 remaining of 365
      annualNetPremium: '10000.00',
      method: 'PRO_RATA',
    });

    expect(result.totalDays).toBe(365);
    expect(result.daysUsed).toBe(182);
    expect(result.remainingDays).toBe(183);
    expect(result.refundNet.toNumber()).toBeCloseTo(5013.7, 1);
  });

  it('calculates 0% refund if days used exceeds policy period', () => {
    const result = calculateCancellationRefund({
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      cancelEffectiveDate: '2027-02-01',
      annualNetPremium: '10000.00',
      method: 'SHORT_RATE',
    });

    expect(result.daysUsed).toBe(365);
    expect(result.retentionPercent.toNumber()).toBe(100);
    expect(result.refundPercent.toNumber()).toBe(0);
    expect(result.totalRefund.toNumber()).toBe(0);
  });
});

