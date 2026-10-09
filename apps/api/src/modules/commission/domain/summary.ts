import { Decimal } from 'decimal.js';

export type SummaryGroupBy = 'agent' | 'policy' | 'insurer' | 'period' | 'product';

export interface SummaryCommissionRow {
  commissionType: string;
  status: string;
  shareAmount: string;
  whtAmount: string;
  netAmount: string;
  grossAmount: string;
  brokerShareAmount: string | null;
  payeeId: string;
  payeeName: string;
  policyId: string;
  policyNo: string;
  insurerId: string;
  insurerName: string;
  productId: string;
  productName: string;
  /** 'YYYY-MM' of the month the policy was issued. */
  period: string;
  /** Net of every adjustment recorded against this row. */
  adjustmentNet: string;
}

export interface SummaryGroup {
  key: string;
  label: string;
  commissionCount: number;
  /** Gross commission of the policies involved, counted once per policy (from the AGENT rows). */
  grossAmount: string;
  brokerShareAmount: string;
  shareAmount: string;
  whtAmount: string;
  netAmount: string;
  adjustmentNet: string;
  totalNet: string;
  netByStatus: Record<string, string>;
}

const KEY: Record<SummaryGroupBy, (r: SummaryCommissionRow) => { key: string; label: string }> = {
  agent: (r) => ({ key: r.payeeId, label: r.payeeName }),
  policy: (r) => ({ key: r.policyId, label: r.policyNo }),
  insurer: (r) => ({ key: r.insurerId, label: r.insurerName }),
  product: (r) => ({ key: r.productId, label: r.productName }),
  period: (r) => ({ key: r.period, label: r.period }),
};

interface Acc {
  key: string;
  label: string;
  count: number;
  gross: Decimal;
  broker: Decimal;
  share: Decimal;
  wht: Decimal;
  net: Decimal;
  adj: Decimal;
  byStatus: Map<string, Decimal>;
}

const zero = () => new Decimal(0);

function emptyAcc(key: string, label: string): Acc {
  return { key, label, count: 0, gross: zero(), broker: zero(), share: zero(), wht: zero(), net: zero(), adj: zero(), byStatus: new Map() };
}

function toGroup(a: Acc): SummaryGroup {
  return {
    key: a.key,
    label: a.label,
    commissionCount: a.count,
    grossAmount: a.gross.toFixed(2),
    brokerShareAmount: a.broker.toFixed(2),
    shareAmount: a.share.toFixed(2),
    whtAmount: a.wht.toFixed(2),
    netAmount: a.net.toFixed(2),
    adjustmentNet: a.adj.toFixed(2),
    totalNet: a.net.plus(a.adj).toFixed(2),
    netByStatus: Object.fromEntries([...a.byStatus.entries()].map(([s, v]) => [s, v.toFixed(2)])),
  };
}

function add(acc: Acc, r: SummaryCommissionRow): void {
  acc.count += 1;
  // Gross and broker share belong to the policy, not the payee: take them from the AGENT row only.
  if (r.commissionType === 'AGENT') {
    acc.gross = acc.gross.plus(r.grossAmount);
    acc.broker = acc.broker.plus(r.brokerShareAmount ?? 0);
  }
  acc.share = acc.share.plus(r.shareAmount);
  acc.wht = acc.wht.plus(r.whtAmount);
  acc.net = acc.net.plus(r.netAmount);
  acc.adj = acc.adj.plus(r.adjustmentNet);
  acc.byStatus.set(r.status, (acc.byStatus.get(r.status) ?? zero()).plus(r.netAmount));
}

export function summarizeCommissions(
  rows: SummaryCommissionRow[],
  groupBy: SummaryGroupBy,
): { groups: SummaryGroup[]; total: SummaryGroup } {
  const groups = new Map<string, Acc>();
  const total = emptyAcc('TOTAL', 'TOTAL');
  for (const r of rows) {
    const { key, label } = KEY[groupBy](r);
    let acc = groups.get(key);
    if (!acc) {
      acc = emptyAcc(key, label);
      groups.set(key, acc);
    }
    add(acc, r);
    add(total, r);
  }

  const ordered = [...groups.values()]
    .map(toGroup)
    .sort((a, b) =>
      groupBy === 'period'
        ? b.key.localeCompare(a.key)
        : new Decimal(b.totalNet).comparedTo(a.totalNet) || a.label.localeCompare(b.label),
    );
  return { groups: ordered, total: toGroup(total) };
}
