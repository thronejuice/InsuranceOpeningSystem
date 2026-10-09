import { describe, expect, it } from 'vitest';
import { bangkokDateString, computeInvoiceStatus, outstandingAmount } from './invoice-status.js';

const NOW = new Date('2026-10-09T05:00:00Z'); // 12:00 Bangkok, 2026-10-09
const base = { amount: '10000.00', dueDate: new Date('2026-10-20T00:00:00Z'), now: NOW };

describe('computeInvoiceStatus', () => {
  it('PENDING when nothing is paid and not yet due', () => {
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0' })).toBe('PENDING');
  });

  it('PARTIALLY_PAID when some but not all is paid and not yet due', () => {
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0.01' })).toBe('PARTIALLY_PAID');
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '9999.99' })).toBe('PARTIALLY_PAID');
  });

  it('PAID when fully paid, even if past due', () => {
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '10000.00' })).toBe('PAID');
    expect(
      computeInvoiceStatus({ ...base, status: 'OVERDUE', paid: '10000.00', dueDate: new Date('2026-01-01T00:00:00Z') }),
    ).toBe('PAID');
  });

  it('is not overdue on the due date itself, overdue from the next day', () => {
    const due = new Date('2026-10-09T00:00:00Z');
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0', dueDate: due })).toBe('PENDING');
    const dueYesterday = new Date('2026-10-08T00:00:00Z');
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0', dueDate: dueYesterday })).toBe('OVERDUE');
  });

  it('stays OVERDUE when part-paid after the due date', () => {
    const due = new Date('2026-10-01T00:00:00Z');
    expect(computeInvoiceStatus({ ...base, status: 'PARTIALLY_PAID', paid: '4000', dueDate: due })).toBe('OVERDUE');
  });

  it('uses the Bangkok calendar day: 18:30Z on the due date is already the next day in Bangkok', () => {
    const due = new Date('2026-10-09T00:00:00Z');
    const lateUtc = new Date('2026-10-09T18:30:00Z'); // 2026-10-10 01:30 Bangkok
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0', dueDate: due, now: lateUtc })).toBe('OVERDUE');
  });

  it('CANCELLED is terminal regardless of payments or dates', () => {
    expect(computeInvoiceStatus({ ...base, status: 'CANCELLED', paid: '10000.00' })).toBe('CANCELLED');
    expect(computeInvoiceStatus({ ...base, status: 'CANCELLED', paid: '0', dueDate: '2020-01-01' })).toBe('CANCELLED');
  });

  it('accepts a string due date', () => {
    expect(computeInvoiceStatus({ ...base, status: 'PENDING', paid: '0', dueDate: '2026-10-08' })).toBe('OVERDUE');
  });
});

describe('outstandingAmount', () => {
  it('subtracts without floating point error', () => {
    expect(outstandingAmount('0.30', '0.10').toFixed(2)).toBe('0.20');
    expect(outstandingAmount('1000.10', '0.20').toFixed(2)).toBe('999.90');
  });

  it('never goes negative', () => {
    expect(outstandingAmount('100', '150').toFixed(2)).toBe('0.00');
  });
});

describe('bangkokDateString', () => {
  it('rolls over at 17:00Z', () => {
    expect(bangkokDateString(new Date('2026-12-31T16:59:59Z'))).toBe('2026-12-31');
    expect(bangkokDateString(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });
});
