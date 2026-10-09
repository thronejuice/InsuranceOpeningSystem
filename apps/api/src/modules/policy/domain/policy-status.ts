import { PolicyStatus } from '../../../generated/prisma/enums.js';

export interface PolicyStatusEvaluationInput {
  status: PolicyStatus;
  effectiveDate: Date | string;
  expiryDate?: Date | string | null;
}

/**
 * Normalizes input date to midnight (00:00:00.000) in Bangkok time (+07:00).
 */
export function toBangkokMidnight(d: Date | string): Date {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const bkkFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = bkkFormatter.format(dateObj); // YYYY-MM-DD
  return new Date(`${parts}T00:00:00+07:00`);
}

/**
 * Evaluates the initial PolicyStatus upon policy issuance (D-10).
 * If effectiveDate is strictly in the future (tomorrow or later Bangkok time), status is PENDING.
 * If effectiveDate <= today Bangkok time, status is ACTIVE.
 */
export function evaluateInitialPolicyStatus(
  effectiveDate: Date | string,
  now = new Date(),
): PolicyStatus {
  const eff = toBangkokMidnight(effectiveDate);
  const today = toBangkokMidnight(now);

  if (eff.getTime() > today.getTime()) {
    return PolicyStatus.PENDING;
  }
  return PolicyStatus.ACTIVE;
}

/**
 * Evaluates daily status transition for a policy based on current date (D-10):
 * - Terminal / non-managed statuses (CANCEL_REQUESTED, CANCELLED, RENEWED, DRAFT) are never changed.
 * - If status is EXPIRED, it stays EXPIRED.
 * - If expiryDate is present and expiryDate < today -> EXPIRED (applies to PENDING, ACTIVE, EXPIRING).
 * - If status is PENDING:
 *     - If effectiveDate <= today < expiryDate -> becomes ACTIVE (or EXPIRING if <= 90 days to expiry).
 * - If status is ACTIVE:
 *     - If expiryDate is within 90 days (daysRemaining <= 90) -> becomes EXPIRING.
 * - Returns the new PolicyStatus if changed, or null if no change is needed.
 */
export function evaluatePolicyDailyStatus(
  policy: PolicyStatusEvaluationInput,
  now = new Date(),
): PolicyStatus | null {
  const { status, effectiveDate, expiryDate } = policy;

  // Don't modify already terminal or non-active workflow statuses
  if (
    status === PolicyStatus.CANCELLED ||
    status === PolicyStatus.CANCEL_REQUESTED ||
    status === PolicyStatus.RENEWED ||
    status === PolicyStatus.DRAFT ||
    status === PolicyStatus.EXPIRED
  ) {
    return null;
  }

  const today = toBangkokMidnight(now);
  const eff = toBangkokMidnight(effectiveDate);
  const exp = expiryDate ? toBangkokMidnight(expiryDate) : null;

  // 1. Check expiration: if expiryDate < today -> EXPIRED
  if (exp && exp.getTime() < today.getTime()) {
    return PolicyStatus.EXPIRED;
  }

  // 2. If status is PENDING, check if it should become ACTIVE or EXPIRING
  if (status === PolicyStatus.PENDING) {
    if (eff.getTime() <= today.getTime()) {
      // It has become effective!
      // Check if it's already within 90 days of expiry
      if (exp) {
        const diffMs = exp.getTime() - today.getTime();
        const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 90) {
          return PolicyStatus.EXPIRING;
        }
      }
      return PolicyStatus.ACTIVE;
    }
    return null;
  }

  // 3. If status is ACTIVE, check if it should become EXPIRING (<= 90 days)
  if (status === PolicyStatus.ACTIVE) {
    if (exp) {
      const diffMs = exp.getTime() - today.getTime();
      const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 90) {
        return PolicyStatus.EXPIRING;
      }
    }
    return null;
  }

  // 4. If status is EXPIRING, it stays EXPIRING until expiryDate < today (handled in step 1)
  return null;
}

