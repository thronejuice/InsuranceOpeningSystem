import { describe, expect, it } from 'vitest';
import { canRenew, computeDefaultRenewalDates, validateRenewalDates } from './renewal-dates.js';

const d = (s: string) => new Date(s);

describe('computeDefaultRenewalDates', () => {
  it('starts on the previous expiry and keeps the same term', () => {
    const r = computeDefaultRenewalDates({ effectiveDate: d('2026-10-01'), expiryDate: d('2027-10-01') });
    expect(r.effectiveDate).toEqual(d('2027-10-01'));
    expect(r.expiryDate).toEqual(d('2028-10-01'));
  });

  it('keeps a whole-month term by calendar (6 months)', () => {
    const r = computeDefaultRenewalDates({ effectiveDate: d('2026-01-01'), expiryDate: d('2026-07-01') });
    expect(r.effectiveDate).toEqual(d('2026-07-01'));
    expect(r.expiryDate).toEqual(d('2027-01-01'));
  });

  it('keeps an odd-length term by days when it is not whole months', () => {
    const r = computeDefaultRenewalDates({ effectiveDate: d('2026-01-01'), expiryDate: d('2026-01-31') });
    expect(r.effectiveDate).toEqual(d('2026-01-31'));
    expect(r.expiryDate).toEqual(d('2026-03-02'));
  });

  it('falls back to 365 days when the previous expiry is missing', () => {
    const r = computeDefaultRenewalDates({ effectiveDate: d('2026-10-01'), expiryDate: null });
    expect(r.effectiveDate).toEqual(d('2026-10-01'));
    expect(r.expiryDate).toEqual(d('2027-10-01'));
  });
});

describe('validateRenewalDates', () => {
  it('accepts expiry after effective', () => {
    expect(validateRenewalDates({ effectiveDate: d('2027-10-01'), expiryDate: d('2028-10-01') })).toBeNull();
  });

  it('rejects expiry equal to or before effective', () => {
    expect(validateRenewalDates({ effectiveDate: d('2027-10-01'), expiryDate: d('2027-10-01') })).not.toBeNull();
    expect(validateRenewalDates({ effectiveDate: d('2027-10-01'), expiryDate: d('2027-09-01') })).not.toBeNull();
  });

  it('rejects invalid dates', () => {
    expect(validateRenewalDates({ effectiveDate: d('nope'), expiryDate: d('2027-10-01') })).not.toBeNull();
  });
});

describe('canRenew', () => {
  it.each(['PENDING', 'IN_PROGRESS', 'QUOTATION', 'CUSTOMER_CONTACTED', 'ACCEPTED'])('allows %s without a new job', (status) => {
    expect(canRenew({ status, newJobId: null })).toBe(true);
  });

  it.each(['REJECTED', 'RENEWED', 'LOST', 'CANCELLED'])('blocks %s', (status) => {
    expect(canRenew({ status, newJobId: null })).toBe(false);
  });

  it('blocks when a renewal job already exists', () => {
    expect(canRenew({ status: 'IN_PROGRESS', newJobId: 'abc' })).toBe(false);
  });
});
