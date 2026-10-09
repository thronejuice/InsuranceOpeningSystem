import { Decimal } from 'decimal.js';
import { bangkokDateString } from '../../invoice/domain/invoice-status.js';

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface PeriodRange {
  period: string;
  /** First instant of the month in Asia/Bangkok. */
  start: Date;
  /** First instant of the NEXT month in Asia/Bangkok — items must be payable strictly before this. */
  endExclusive: Date;
  /** Last calendar day of the month, 'YYYY-MM-DD'. */
  lastDay: string;
}

/** Null when `period` is not a valid 'YYYY-MM'. */
export function periodRange(period: string): PeriodRange | null {
  const m = PERIOD_RE.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    period,
    start: new Date(`${year}-${pad(month)}-01T00:00:00+07:00`),
    endExclusive: new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00+07:00`),
    lastDay: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function currentPeriod(now: Date): string {
  return bangkokDateString(now).slice(0, 7);
}

export interface StatementCommissionInput {
  id: string;
  shareAmount: string;
  whtAmount: string;
  netAmount: string;
}

export interface StatementAdjustmentInput extends StatementCommissionInput {
  createdAt: Date;
}

export interface StatementSelection {
  commissionIds: string[];
  adjustmentIds: string[];
  /** Pending adjustments that did not fit and stay for the next statement. */
  deferredAdjustmentIds: string[];
  shareTotal: string;
  whtTotal: string;
  netTotal: string;
}

/**
 * D27 rule: a statement never nets below zero. Every payable commission goes in; adjustments are
 * netted oldest-first and only while the running net stays ≥ 0 — those that do not fit are carried
 * to the next statement untouched. Positive adjustments always fit.
 */
export function selectStatementItems(
  commissions: StatementCommissionInput[],
  adjustments: StatementAdjustmentInput[],
): StatementSelection {
  let share = new Decimal(0);
  let wht = new Decimal(0);
  let net = new Decimal(0);
  for (const c of commissions) {
    share = share.plus(c.shareAmount);
    wht = wht.plus(c.whtAmount);
    net = net.plus(c.netAmount);
  }

  const taken: string[] = [];
  const deferred: string[] = [];
  const ordered = [...adjustments].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  for (const a of ordered) {
    const nextNet = net.plus(a.netAmount);
    if (nextNet.isNegative()) {
      deferred.push(a.id);
      continue;
    }
    taken.push(a.id);
    share = share.plus(a.shareAmount);
    wht = wht.plus(a.whtAmount);
    net = nextNet;
  }

  return {
    commissionIds: commissions.map((c) => c.id),
    adjustmentIds: taken,
    deferredAdjustmentIds: deferred,
    shareTotal: share.toFixed(2),
    whtTotal: wht.toFixed(2),
    netTotal: net.toFixed(2),
  };
}
