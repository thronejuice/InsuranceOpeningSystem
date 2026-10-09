import { describe, expect, it } from 'vitest';
import { summarizeCommissions, type SummaryCommissionRow } from './summary.js';

const row = (over: Partial<SummaryCommissionRow>): SummaryCommissionRow => ({
  commissionType: 'AGENT',
  status: 'APPROVED',
  shareAmount: '1000.00',
  whtAmount: '30.00',
  netAmount: '970.00',
  grossAmount: '2500.00',
  brokerShareAmount: '1000.00',
  payeeId: 'u1',
  payeeName: 'Agent One',
  policyId: 'p1',
  policyNo: 'PL-1',
  insurerId: 'i1',
  insurerName: 'Insurer One',
  productId: 'pr1',
  productName: 'Fire',
  period: '2026-10',
  adjustmentNet: '0.00',
  ...over,
});

describe('summarizeCommissions', () => {
  const rows = [
    row({}),
    row({ commissionType: 'TEAM', payeeId: 'm1', payeeName: 'Manager', shareAmount: '250.00', whtAmount: '7.50', netAmount: '242.50', brokerShareAmount: null }),
    row({ policyId: 'p2', policyNo: 'PL-2', insurerId: 'i2', insurerName: 'Insurer Two', productId: 'pr2', productName: 'Motor', period: '2026-09', status: 'PAID', netAmount: '500.00', shareAmount: '515.46', whtAmount: '15.46', grossAmount: '1500.00', brokerShareAmount: '800.00', adjustmentNet: '-100.00' }),
  ];

  it('counts policy-level gross and broker share once, from the AGENT row only', () => {
    const { total } = summarizeCommissions(rows, 'policy');
    expect(total.grossAmount).toBe('4000.00'); // 2500 + 1500, not 2500 twice
    expect(total.brokerShareAmount).toBe('1800.00');
    expect(total.commissionCount).toBe(3);
  });

  it('groups by agent/payee including the manager override row', () => {
    const { groups } = summarizeCommissions(rows, 'agent');
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    expect(byKey.u1.netAmount).toBe('1470.00');
    expect(byKey.u1.adjustmentNet).toBe('-100.00');
    expect(byKey.u1.totalNet).toBe('1370.00');
    expect(byKey.m1.netAmount).toBe('242.50');
    expect(byKey.m1.grossAmount).toBe('0.00'); // the manager's row carries no policy gross
  });

  it('groups by insurer, product and period', () => {
    expect(summarizeCommissions(rows, 'insurer').groups.map((g) => [g.label, g.commissionCount])).toEqual([
      ['Insurer One', 2],
      ['Insurer Two', 1],
    ]);
    expect(summarizeCommissions(rows, 'product').groups.map((g) => g.label).sort()).toEqual(['Fire', 'Motor']);
    expect(summarizeCommissions(rows, 'period').groups.map((g) => g.key)).toEqual(['2026-10', '2026-09']); // newest first
  });

  it('breaks net down by status', () => {
    const { total } = summarizeCommissions(rows, 'agent');
    expect(total.netByStatus).toEqual({ APPROVED: '1212.50', PAID: '500.00' });
  });

  it('sums cents without float drift', () => {
    const many = Array.from({ length: 10 }, () => row({ netAmount: '0.10', shareAmount: '0.10', whtAmount: '0.00' }));
    expect(summarizeCommissions(many, 'agent').total.netAmount).toBe('1.00');
  });

  it('returns an empty summary for no rows', () => {
    const { groups, total } = summarizeCommissions([], 'agent');
    expect(groups).toEqual([]);
    expect(total.totalNet).toBe('0.00');
  });
});
