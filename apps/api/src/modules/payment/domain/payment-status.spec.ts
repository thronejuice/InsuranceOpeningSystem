import { describe, expect, it } from 'vitest';
import { derivePaymentStatus, type PaymentStatusInput } from './payment-status.js';

const DUE = new Date('2026-12-31');
const PAST_DUE = new Date('2025-01-01');
const NOW = new Date('2026-10-01');

function s(totalPremium: string, totalPaid: string, dueDate: Date | null): PaymentStatusInput {
  return { totalPremium, totalPaid, paymentDueDate: dueDate, now: NOW };
}

describe('derivePaymentStatus (spec §19.2)', () => {
  it('UNPAID — no payments, due date in future', () => {
    expect(derivePaymentStatus(s('10000.00', '0.00', DUE))).toBe('UNPAID');
  });

  it('UNPAID — no payments, no due date', () => {
    expect(derivePaymentStatus(s('10000.00', '0.00', null))).toBe('UNPAID');
  });

  it('PAID — totalPaid equals totalPremium', () => {
    expect(derivePaymentStatus(s('10000.00', '10000.00', DUE))).toBe('PAID');
  });

  it('PAID — totalPaid exceeds totalPremium (overpayment allowed)', () => {
    expect(derivePaymentStatus(s('10000.00', '10001.00', DUE))).toBe('PAID');
  });

  it('PAID — totalPaid equals totalPremium, no due date', () => {
    expect(derivePaymentStatus(s('5000.00', '5000.00', null))).toBe('PAID');
  });

  it('PARTIAL — partial payment, due date in future', () => {
    expect(derivePaymentStatus(s('10000.00', '5000.00', DUE))).toBe('PARTIAL');
  });

  it('PARTIAL — partial payment, no due date', () => {
    expect(derivePaymentStatus(s('10000.00', '1.00', null))).toBe('PARTIAL');
  });

  it('OVERDUE — no payment, past due date', () => {
    expect(derivePaymentStatus(s('10000.00', '0.00', PAST_DUE))).toBe('OVERDUE');
  });

  it('OVERDUE — partial payment, past due date', () => {
    expect(derivePaymentStatus(s('10000.00', '3000.00', PAST_DUE))).toBe('OVERDUE');
  });

  it('PAID beats OVERDUE — fully paid even though past due', () => {
    expect(derivePaymentStatus(s('10000.00', '10000.00', PAST_DUE))).toBe('PAID');
  });

  it('boundary — totalPaid = totalPremium - 0.01 with past due → OVERDUE', () => {
    expect(derivePaymentStatus(s('10000.00', '9999.99', PAST_DUE))).toBe('OVERDUE');
  });

  it('boundary — totalPaid = totalPremium - 0.01 with future due → PARTIAL', () => {
    expect(derivePaymentStatus(s('10000.00', '9999.99', DUE))).toBe('PARTIAL');
  });
});
