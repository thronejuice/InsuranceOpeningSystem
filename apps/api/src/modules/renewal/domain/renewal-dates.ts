export interface RenewalDates {
  effectiveDate: Date;
  expiryDate: Date;
}

/**
 * Default dates for a renewal job: coverage starts on the previous expiry date
 * and lasts as long as the previous term (BR-013).
 * Falls back to a 365-day term when the previous job has no expiry date.
 */
export function computeDefaultRenewalDates(
  previous: { effectiveDate: Date; expiryDate: Date | null },
): RenewalDates {
  const effectiveDate = new Date(previous.expiryDate ?? previous.effectiveDate);
  if (!previous.expiryDate) return { effectiveDate, expiryDate: addUtcMonths(effectiveDate, 12) };

  // Whole-month terms (the usual 12 months) are added by calendar so leap years do not shift the date
  const months = wholeMonthsBetween(previous.effectiveDate, previous.expiryDate);
  if (months !== null) return { effectiveDate, expiryDate: addUtcMonths(effectiveDate, months) };

  const termMs = previous.expiryDate.getTime() - previous.effectiveDate.getTime();
  return { effectiveDate, expiryDate: new Date(effectiveDate.getTime() + termMs) };
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Month count when `to` falls on the same UTC day-of-month as `from`, otherwise null. */
function wholeMonthsBetween(from: Date, to: Date): number | null {
  if (from.getUTCDate() !== to.getUTCDate() || to <= from) return null;
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

/** Returns an error message when the dates are unusable, otherwise null. */
export function validateRenewalDates(dates: RenewalDates): string | null {
  if (Number.isNaN(dates.effectiveDate.getTime()) || Number.isNaN(dates.expiryDate.getTime())) {
    return 'Invalid renewal date';
  }
  if (dates.expiryDate.getTime() <= dates.effectiveDate.getTime()) {
    return 'Expiry date must be after effective date';
  }
  return null;
}

/** Customer-owned document types that carry over to a renewal job; quotation/proposal/policy/payment documents do not. */
export const RENEWAL_COPY_DOCUMENT_TYPES = [
  'ID_CARD',
  'COMPANY_REGISTRATION',
  'TAX_DOCUMENT',
  'VEHICLE_BOOK',
  'VEHICLE_PHOTO',
  'RISK_SURVEY',
  'OTHER',
] as const;

/** Renewals that can still be turned into a renewal job (no job linked yet). */
export const RENEWABLE_RENEWAL_STATUSES = ['PENDING', 'IN_PROGRESS', 'QUOTATION', 'CUSTOMER_CONTACTED', 'ACCEPTED'] as const;

export function canRenew(renewal: { status: string; newJobId: string | null }): boolean {
  return renewal.newJobId === null && (RENEWABLE_RENEWAL_STATUSES as readonly string[]).includes(renewal.status);
}
