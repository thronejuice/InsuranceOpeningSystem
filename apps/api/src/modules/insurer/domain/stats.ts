import { Decimal } from 'decimal.js';

export interface QuotationStatusCount {
  status: string;
  count: number;
}

export interface PolicyPremiumGroup {
  status: string;
  count: number;
  /** Sum of total premium as a Decimal string. */
  premium: string;
}

export interface InsurerStats {
  quotations: { total: number; received: number; selected: number };
  /** selected ÷ received as a percentage with 2 decimals (OQ-24); "0.00" when nothing was received. */
  winRatePct: string;
  policies: { issued: number; cancelled: number };
  issuedPremium: string;
  cancelledPremium: string;
}

/** A quotation counts as "received" once the insurer replied with a price — it is not still waiting or void. */
const NOT_RECEIVED = new Set(['REQUESTED', 'CANCELLED']);
/** Policies that never took effect or were already withdrawn do not count as issued business. */
const NOT_ISSUED = new Set(['DRAFT', 'CANCELLED']);

export function computeInsurerStats(quotations: QuotationStatusCount[], policies: PolicyPremiumGroup[]): InsurerStats {
  const total = quotations.reduce((n, q) => n + q.count, 0);
  const received = quotations.filter((q) => !NOT_RECEIVED.has(q.status)).reduce((n, q) => n + q.count, 0);
  const selected = quotations.filter((q) => q.status === 'SELECTED').reduce((n, q) => n + q.count, 0);
  const winRatePct = received === 0 ? '0.00' : new Decimal(selected).div(received).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

  const issuedGroups = policies.filter((p) => !NOT_ISSUED.has(p.status));
  const cancelledGroups = policies.filter((p) => p.status === 'CANCELLED');
  const sum = (groups: PolicyPremiumGroup[]) => groups.reduce((acc, g) => acc.plus(g.premium), new Decimal(0)).toFixed(2);

  return {
    quotations: { total, received, selected },
    winRatePct,
    policies: {
      issued: issuedGroups.reduce((n, g) => n + g.count, 0),
      cancelled: cancelledGroups.reduce((n, g) => n + g.count, 0),
    },
    issuedPremium: sum(issuedGroups),
    cancelledPremium: sum(cancelledGroups),
  };
}
