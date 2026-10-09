import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateInstallments, calculateDueDate } from './installments.js';

describe('installments domain calculation', () => {
  it('calculates 1 installment (full payment) correctly', () => {
    const issueDate = new Date('2026-05-10');
    const term = { installments: 1, intervalMonths: 0, firstDueDays: 30 };
    const result = calculateInstallments(10700, 10000, 0, 700, term, issueDate);

    expect(result).toHaveLength(1);
    expect(result[0].installmentNo).toBe(1);
    expect(result[0].amount.toNumber()).toBe(10700);
    expect(result[0].netAmount.toNumber()).toBe(10000);
    expect(result[0].vat.toNumber()).toBe(700);
    expect(result[0].dueDate.toISOString().slice(0, 10)).toBe('2026-06-09');
  });

  it('calculates 3 installments with rounding and preserves exact total sum', () => {
    const issueDate = new Date('2026-01-15');
    const term = { installments: 3, intervalMonths: 1, firstDueDays: 30 };
    // 10,000 / 3 = 3333.33 each, remainder to last
    const result = calculateInstallments(10000, 9345.79, 0, 654.21, term, issueDate);

    expect(result).toHaveLength(3);
    const sumAmount = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    expect(sumAmount.toNumber()).toBe(10000);

    const sumNet = result.reduce((acc, r) => acc.plus(r.netAmount), new Decimal(0));
    expect(sumNet.toNumber()).toBe(9345.79);

    const sumVat = result.reduce((acc, r) => acc.plus(r.vat), new Decimal(0));
    expect(sumVat.toNumber()).toBe(654.21);

    expect(result[0].installmentNo).toBe(1);
    expect(result[1].installmentNo).toBe(2);
    expect(result[2].installmentNo).toBe(3);
  });

  it('calculates 6 installments and verifies interval months and dates', () => {
    const issueDate = new Date('2026-01-01');
    const term = { installments: 6, intervalMonths: 1, firstDueDays: 30 };
    const result = calculateInstallments(60000, 56000, 200, 3800, term, issueDate);

    expect(result).toHaveLength(6);
    const sumAmount = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    expect(sumAmount.toNumber()).toBe(60000);

    // Check dates increment by month
    expect(result[0].dueDate.getMonth()).toBe(0); // Jan 31
    expect(result[1].dueDate.getMonth()).toBe(1); // Feb 28
  });

  it('handles month end day clamping (e.g. Jan 31 -> Feb 28 in non-leap year)', () => {
    // Test calculateDueDate with 31st of month
    const jan31 = new Date('2026-01-01');
    const d1 = calculateDueDate(jan31, 1, { installments: 3, intervalMonths: 1, firstDueDays: 30 }); // Jan 31
    const d2 = calculateDueDate(jan31, 2, { installments: 3, intervalMonths: 1, firstDueDays: 30 }); // Feb 28 in 2026
    
    expect(d1.getDate()).toBe(31);
    expect(d2.getMonth()).toBe(1); // February
    expect(d2.getDate()).toBe(28); // clamped to 28
  });
});

