import { describe, expect, it } from 'vitest';
import { groupReceivables, type OutstandingInvoiceRow } from './receivables.js';

const NOW = new Date('2026-10-09T05:00:00Z');
const row = (over: Partial<OutstandingInvoiceRow>): OutstandingInvoiceRow => ({
  customerId: 'c1',
  customerName: 'Customer One',
  policyId: 'p1',
  policyNo: 'PL-1',
  dueDate: '2026-10-09',
  outstanding: '100.00',
  ...over,
});

describe('groupReceivables', () => {
  it('groups by customer and buckets each invoice by aging', () => {
    const { groups, summary } = groupReceivables(
      [
        row({ dueDate: '2026-10-20', outstanding: '100.10' }), // not due
        row({ dueDate: '2026-10-01', outstanding: '200.20' }), // 8 days
        row({ dueDate: '2026-08-01', outstanding: '300.30' }), // 69 days
        row({ dueDate: '2026-05-01', outstanding: '400.40' }), // 161 days
        row({ customerId: 'c2', customerName: 'Customer Two', policyId: 'p2', policyNo: 'PL-2', outstanding: '50.00' }),
      ],
      'customer',
      NOW,
    );

    expect(groups).toHaveLength(2);
    const c1 = groups.find((g) => g.customerId === 'c1')!;
    expect(c1.outstanding).toBe('1001.00');
    expect(c1.invoiceCount).toBe(4);
    expect(c1.aging).toEqual({ NOT_DUE: '100.10', D0_30: '200.20', D31_60: '0.00', D61_90: '300.30', D90_PLUS: '400.40' });
    expect(c1.policyId).toBeNull();
    expect(summary.outstanding).toBe('1051.00');
    expect(summary.aging.NOT_DUE).toBe('150.10');
  });

  it('groups by policy and keeps policy identity', () => {
    const { groups } = groupReceivables(
      [row({ policyId: 'p1', outstanding: '10.00' }), row({ policyId: 'p2', policyNo: 'PL-2', outstanding: '20.00' })],
      'policy',
      NOW,
    );
    expect(groups.map((g) => [g.policyNo, g.outstanding])).toEqual([
      ['PL-2', '20.00'],
      ['PL-1', '10.00'],
    ]);
  });

  it('sums cents without floating point drift', () => {
    const { summary } = groupReceivables(
      [row({ outstanding: '0.10' }), row({ outstanding: '0.20' }), row({ outstanding: '0.30' })],
      'customer',
      NOW,
    );
    expect(summary.outstanding).toBe('0.60');
  });

  it('ignores rows with nothing outstanding and returns empty for no rows', () => {
    expect(groupReceivables([row({ outstanding: '0.00' })], 'customer', NOW).groups).toEqual([]);
    expect(groupReceivables([], 'policy', NOW).summary.outstanding).toBe('0.00');
  });

  it('orders by largest outstanding first', () => {
    const { groups } = groupReceivables(
      [row({ customerId: 'a', outstanding: '5.00' }), row({ customerId: 'b', outstanding: '9.00' })],
      'customer',
      NOW,
    );
    expect(groups.map((g) => g.customerId)).toEqual(['b', 'a']);
  });
});
