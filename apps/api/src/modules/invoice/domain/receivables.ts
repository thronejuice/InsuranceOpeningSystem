import { Decimal } from 'decimal.js';
import { AGING_BUCKETS, agingBucket, type AgingBucket } from './aging.js';

export interface OutstandingInvoiceRow {
  customerId: string;
  customerName: string;
  policyId: string;
  policyNo: string;
  dueDate: Date | string;
  outstanding: string;
}

export type ReceivableGroupBy = 'customer' | 'policy';

export interface ReceivableGroup {
  key: string;
  customerId: string;
  customerName: string;
  policyId: string | null;
  policyNo: string | null;
  invoiceCount: number;
  outstanding: string;
  aging: Record<AgingBucket, string>;
}

export interface ReceivableSummary {
  outstanding: string;
  aging: Record<AgingBucket, string>;
}

function emptyBuckets(): Record<AgingBucket, Decimal> {
  return Object.fromEntries(AGING_BUCKETS.map((b) => [b, new Decimal(0)])) as Record<AgingBucket, Decimal>;
}

function toStrings(buckets: Record<AgingBucket, Decimal>): Record<AgingBucket, string> {
  return Object.fromEntries(AGING_BUCKETS.map((b) => [b, buckets[b].toFixed(2)])) as Record<AgingBucket, string>;
}

/** Groups still-owed invoices per customer or per policy, bucketing each by days past due. */
export function groupReceivables(
  rows: OutstandingInvoiceRow[],
  groupBy: ReceivableGroupBy,
  now: Date,
): { groups: ReceivableGroup[]; summary: ReceivableSummary } {
  const acc = new Map<string, { row: OutstandingInvoiceRow; count: number; total: Decimal; buckets: Record<AgingBucket, Decimal> }>();
  const grand = emptyBuckets();
  let grandTotal = new Decimal(0);

  for (const row of rows) {
    const amount = new Decimal(row.outstanding);
    if (amount.lessThanOrEqualTo(0)) continue;
    const bucket = agingBucket(row.dueDate, now);
    const key = groupBy === 'customer' ? row.customerId : row.policyId;

    let entry = acc.get(key);
    if (!entry) {
      entry = { row, count: 0, total: new Decimal(0), buckets: emptyBuckets() };
      acc.set(key, entry);
    }
    entry.count += 1;
    entry.total = entry.total.plus(amount);
    entry.buckets[bucket] = entry.buckets[bucket].plus(amount);
    grand[bucket] = grand[bucket].plus(amount);
    grandTotal = grandTotal.plus(amount);
  }

  const groups = [...acc.entries()]
    .map(([key, e]): ReceivableGroup => ({
      key,
      customerId: e.row.customerId,
      customerName: e.row.customerName,
      policyId: groupBy === 'policy' ? e.row.policyId : null,
      policyNo: groupBy === 'policy' ? e.row.policyNo : null,
      invoiceCount: e.count,
      outstanding: e.total.toFixed(2),
      aging: toStrings(e.buckets),
    }))
    .sort((a, b) => new Decimal(b.outstanding).comparedTo(a.outstanding) || a.key.localeCompare(b.key));

  return { groups, summary: { outstanding: grandTotal.toFixed(2), aging: toStrings(grand) } };
}
