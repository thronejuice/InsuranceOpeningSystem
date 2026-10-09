import { describe, expect, it } from 'vitest';
import { PolicyStatus } from '../../../generated/prisma/enums.js';
import {
  evaluateInitialPolicyStatus,
  evaluatePolicyDailyStatus,
  toBangkokMidnight,
} from './policy-status.js';

describe('Policy Status V2 Domain Logic', () => {
  describe('evaluateInitialPolicyStatus', () => {
    const fixedNow = new Date('2026-10-09T10:00:00+07:00'); // Bangkok 2026-10-09

    it('returns ACTIVE when effectiveDate is today', () => {
      const status = evaluateInitialPolicyStatus('2026-10-09', fixedNow);
      expect(status).toBe(PolicyStatus.ACTIVE);
    });

    it('returns ACTIVE when effectiveDate is in the past', () => {
      const status = evaluateInitialPolicyStatus('2026-10-01', fixedNow);
      expect(status).toBe(PolicyStatus.ACTIVE);
    });

    it('returns PENDING when effectiveDate is tomorrow', () => {
      const status = evaluateInitialPolicyStatus('2026-10-10', fixedNow);
      expect(status).toBe(PolicyStatus.PENDING);
    });

    it('returns PENDING when effectiveDate is in the future (next month)', () => {
      const status = evaluateInitialPolicyStatus('2026-11-01', fixedNow);
      expect(status).toBe(PolicyStatus.PENDING);
    });
  });

  describe('evaluatePolicyDailyStatus', () => {
    const fixedNow = new Date('2026-10-09T03:00:00+07:00'); // Bangkok 2026-10-09

    // Terminal & unmanaged statuses
    it('returns null for CANCELLED, CANCEL_REQUESTED, RENEWED, DRAFT, EXPIRED', () => {
      const terminalStatuses = [
        PolicyStatus.CANCELLED,
        PolicyStatus.CANCEL_REQUESTED,
        PolicyStatus.RENEWED,
        PolicyStatus.DRAFT,
        PolicyStatus.EXPIRED,
      ];

      for (const status of terminalStatuses) {
        const next = evaluatePolicyDailyStatus(
          {
            status,
            effectiveDate: '2026-01-01',
            expiryDate: '2026-05-01',
          },
          fixedNow,
        );
        expect(next).toBeNull();
      }
    });

    // PENDING policy transitions
    describe('PENDING policy', () => {
      it('remains null when effectiveDate is still in the future', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.PENDING,
            effectiveDate: '2026-10-15',
            expiryDate: '2027-10-15',
          },
          fixedNow,
        );
        expect(next).toBeNull();
      });

      it('transitions PENDING -> ACTIVE when effectiveDate arrives (and expiryDate > 90 days away)', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.PENDING,
            effectiveDate: '2026-10-09',
            expiryDate: '2027-10-09', // 1 year away
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.ACTIVE);
      });

      it('transitions PENDING -> EXPIRING when effectiveDate arrives but expiryDate is <= 90 days', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.PENDING,
            effectiveDate: '2026-10-09',
            expiryDate: '2026-11-09', // ~31 days away
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRING);
      });

      it('transitions PENDING -> EXPIRED if expiryDate is already in the past', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.PENDING,
            effectiveDate: '2026-08-01',
            expiryDate: '2026-09-01',
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRED);
      });
    });

    // ACTIVE policy transitions
    describe('ACTIVE policy', () => {
      it('remains null when expiryDate is > 90 days away', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.ACTIVE,
            effectiveDate: '2026-01-01',
            expiryDate: '2027-03-01',
          },
          fixedNow,
        );
        expect(next).toBeNull();
      });

      it('transitions ACTIVE -> EXPIRING when exactly 90 days remain', () => {
        // Today is 2026-10-09. 90 days later is 2027-01-07
        const expDate = new Date(toBangkokMidnight(fixedNow));
        expDate.setDate(expDate.getDate() + 90);

        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.ACTIVE,
            effectiveDate: '2026-01-01',
            expiryDate: expDate,
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRING);
      });

      it('transitions ACTIVE -> EXPIRING when < 90 days remain (e.g. 30 days)', () => {
        const expDate = new Date(toBangkokMidnight(fixedNow));
        expDate.setDate(expDate.getDate() + 30);

        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.ACTIVE,
            effectiveDate: '2026-01-01',
            expiryDate: expDate,
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRING);
      });

      it('transitions ACTIVE -> EXPIRED when expiryDate has passed (< today)', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.ACTIVE,
            effectiveDate: '2025-10-01',
            expiryDate: '2026-10-08', // Yesterday
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRED);
      });

      it('remains null when expiryDate is today (expires after today)', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.ACTIVE,
            effectiveDate: '2025-10-09',
            expiryDate: '2026-10-09', // Today
          },
          fixedNow,
        );
        // Today is <= 90 days, so ACTIVE -> EXPIRING
        expect(next).toBe(PolicyStatus.EXPIRING);
      });
    });

    // EXPIRING policy transitions
    describe('EXPIRING policy', () => {
      it('remains null while expiryDate is today or future', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.EXPIRING,
            effectiveDate: '2025-10-09',
            expiryDate: '2026-10-15',
          },
          fixedNow,
        );
        expect(next).toBeNull();
      });

      it('transitions EXPIRING -> EXPIRED when expiryDate has passed (< today)', () => {
        const next = evaluatePolicyDailyStatus(
          {
            status: PolicyStatus.EXPIRING,
            effectiveDate: '2025-10-09',
            expiryDate: '2026-10-08', // Yesterday
          },
          fixedNow,
        );
        expect(next).toBe(PolicyStatus.EXPIRED);
      });
    });
  });
});
