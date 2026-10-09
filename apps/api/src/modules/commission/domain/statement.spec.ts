import { describe, expect, it } from 'vitest';
import { currentPeriod, periodRange, selectStatementItems, type StatementAdjustmentInput } from './statement.js';

describe('periodRange', () => {
  it('spans the Asia/Bangkok month', () => {
    const r = periodRange('2026-10')!;
    expect(r.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(r.lastDay).toBe('2026-10-31');
  });

  it('handles December rollover and February length', () => {
    expect(periodRange('2026-12')!.endExclusive.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(periodRange('2028-02')!.lastDay).toBe('2028-02-29');
    expect(periodRange('2027-02')!.lastDay).toBe('2027-02-28');
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026/10', '', 'abcd-ef'])('rejects %j', (v) => {
    expect(periodRange(v)).toBeNull();
  });

  it('an instant just before midnight Bangkok is still inside the month', () => {
    const r = periodRange('2026-10')!;
    expect(new Date('2026-10-31T16:59:59Z') < r.endExclusive).toBe(true);
    expect(new Date('2026-10-31T17:00:00Z') < r.endExclusive).toBe(false);
  });
});

describe('currentPeriod', () => {
  it('uses the Bangkok calendar month', () => {
    expect(currentPeriod(new Date('2026-10-31T16:59:00Z'))).toBe('2026-10');
    expect(currentPeriod(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11');
  });
});

const commission = (id: string, net: string) => ({ id, shareAmount: net, whtAmount: '0.00', netAmount: net });
const adj = (id: string, net: string, day: number): StatementAdjustmentInput => ({
  id, shareAmount: net, whtAmount: '0.00', netAmount: net, createdAt: new Date(`2026-10-${String(day).padStart(2, '0')}T00:00:00Z`),
});

describe('selectStatementItems', () => {
  it('takes every commission and sums share, WHT and net', () => {
    const r = selectStatementItems(
      [{ id: 'a', shareAmount: '1000.00', whtAmount: '30.00', netAmount: '970.00' }, { id: 'b', shareAmount: '500.00', whtAmount: '15.00', netAmount: '485.00' }],
      [],
    );
    expect(r).toMatchObject({ commissionIds: ['a', 'b'], shareTotal: '1500.00', whtTotal: '45.00', netTotal: '1455.00', adjustmentIds: [], deferredAdjustmentIds: [] });
  });

  it('nets a negative adjustment against the commissions', () => {
    const r = selectStatementItems([commission('a', '1000.00')], [adj('x', '-300.00', 1)]);
    expect(r.adjustmentIds).toEqual(['x']);
    expect(r.netTotal).toBe('700.00');
  });

  it('never nets below zero: an adjustment that does not fit is deferred untouched', () => {
    const r = selectStatementItems([commission('a', '100.00')], [adj('big', '-250.00', 1)]);
    expect(r.adjustmentIds).toEqual([]);
    expect(r.deferredAdjustmentIds).toEqual(['big']);
    expect(r.netTotal).toBe('100.00');
  });

  it('nets oldest first and keeps going: a later, smaller one can still fit', () => {
    const r = selectStatementItems(
      [commission('a', '100.00')],
      [adj('old-big', '-150.00', 1), adj('mid', '-60.00', 2), adj('late-small', '-30.00', 3), adj('latest', '-20.00', 4)],
    );
    expect(r.adjustmentIds).toEqual(['mid', 'late-small']);
    expect(r.deferredAdjustmentIds).toEqual(['old-big', 'latest']);
    expect(r.netTotal).toBe('10.00');
  });

  it('positive adjustments always fit and make room for negatives dated after them', () => {
    const r = selectStatementItems([commission('a', '50.00')], [adj('plus', '100.00', 1), adj('minus', '-120.00', 2)]);
    expect(r.adjustmentIds).toEqual(['plus', 'minus']);
    expect(r.netTotal).toBe('30.00');
  });

  it('is exact to the satang', () => {
    const r = selectStatementItems([commission('a', '0.30')], [adj('x', '-0.10', 1), adj('y', '-0.20', 2)]);
    expect(r.netTotal).toBe('0.00');
    expect(r.deferredAdjustmentIds).toEqual([]);
  });

  it('with only negative adjustments there is nothing to pay', () => {
    const r = selectStatementItems([], [adj('x', '-10.00', 1)]);
    expect(r.commissionIds).toEqual([]);
    expect(r.adjustmentIds).toEqual([]);
    expect(r.netTotal).toBe('0.00');
  });
});
