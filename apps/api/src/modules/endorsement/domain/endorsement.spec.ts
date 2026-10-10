import { describe, expect, it } from 'vitest';
import { calculateProRataPremium } from './pro-rata.js';
import { validateEndorsementChanges } from './endorsement-fields.js';
import { EndorsementType } from '../../../generated/prisma/enums.js';

describe('Endorsement domain functions', () => {
  describe('calculateProRataPremium', () => {
    it('calculates 50% pro-rata correctly for 6 months remaining in a 365-day policy', () => {
      const result = calculateProRataPremium({
        effectiveDate: '2026-01-01',
        expiryDate: '2027-01-01',
        endorsementDate: '2026-07-02', // approx half year
        annualNetPremium: 10000,
      });

      expect(result.totalDays).toBe(365);
      expect(result.remainingDays).toBe(183);
      expect(result.proRataNet.toNumber()).toBeCloseTo(5013.7, 1);
      // Stamp duty: ceil(5013.7 * 0.004) = 21
      expect(result.stampDuty.toNumber()).toBe(21);
      // Vat: round2((5013.7 + 21) * 0.07) = 352.43
      expect(result.vat.toNumber()).toBeCloseTo(352.43, 2);
      expect(result.totalAdjustment.toNumber()).toBeCloseTo(5387.13, 1);
    });

    it('returns zero adjustment if endorsement date equals or exceeds expiry date', () => {
      const result = calculateProRataPremium({
        effectiveDate: '2026-01-01',
        expiryDate: '2027-01-01',
        endorsementDate: '2027-01-01',
        annualNetPremium: 10000,
      });

      expect(result.remainingDays).toBe(0);
      expect(result.proRataNet.toNumber()).toBe(0);
      expect(result.totalAdjustment.toNumber()).toBe(0);
    });
  });

  describe('validateEndorsementChanges', () => {
    it('passes when valid customer fields are updated for CHANGE_CUSTOMER', () => {
      const res = validateEndorsementChanges(EndorsementType.CHANGE_CUSTOMER, {
        before: { firstName: 'Old' },
        after: { firstName: 'New', phone: '0812345678' },
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('fails when disallowed fields are provided (e.g. coverages in CHANGE_CUSTOMER)', () => {
      const res = validateEndorsementChanges(EndorsementType.CHANGE_CUSTOMER, {
        after: { firstName: 'New', coverages: [{ name: 'Fire' }] },
      });
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Fields not allowed for CHANGE_CUSTOMER');
    });

    it('passes for CHANGE_SUM_INSURED with sumInsured and coverages', () => {
      const res = validateEndorsementChanges(EndorsementType.CHANGE_SUM_INSURED, {
        after: { sumInsured: 2000000 },
      });
      expect(res.valid).toBe(true);
    });

    it('fails if after object is empty', () => {
      const res = validateEndorsementChanges(EndorsementType.CHANGE_VEHICLE, {
        after: {},
      });
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('At least one field must be modified');
    });
  });
});

