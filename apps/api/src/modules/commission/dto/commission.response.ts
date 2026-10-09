import type { Commission } from '../../../generated/prisma/client.js';

type Money = 'commissionBase' | 'commissionAmount' | 'grossAmount' | 'brokerShareAmount' | 'whtAmount' | 'netAmount';
type Pct = 'commissionRate' | 'sharePct' | 'whtRate';

/** Decimals leave the API as strings (never floats); V1 manual rows have null for the V2 breakdown. */
export type CommissionResponse = Omit<Commission, Money | Pct> & {
  commissionBase: string;
  commissionAmount: string;
  grossAmount: string | null;
  brokerShareAmount: string | null;
  whtAmount: string | null;
  netAmount: string | null;
  commissionRate: string;
  sharePct: string | null;
  whtRate: string | null;
  agent: { id: string; fullName: string } | null;
  policy: { id: string; policyNo: string } | null;
};

export interface CommissionListResponse {
  items: CommissionResponse[];
  total: number;
}

type Dec = { toFixed(dp: number): string };
const money = (d: Dec | null | undefined) => (d ? d.toFixed(2) : null);
const percent = (d: Dec | null | undefined, dp: number) => (d ? d.toFixed(dp) : null);

export function toCommissionResponse(
  c: Commission & { agent?: { id: string; fullName: string } | null; policy?: { id: string; policyNo: string } | null },
): CommissionResponse {
  return {
    ...c,
    commissionBase: c.commissionBase.toFixed(2),
    commissionAmount: c.commissionAmount.toFixed(2),
    grossAmount: money(c.grossAmount),
    brokerShareAmount: money(c.brokerShareAmount),
    whtAmount: money(c.whtAmount),
    netAmount: money(c.netAmount),
    commissionRate: c.commissionRate.toFixed(4),
    sharePct: percent(c.sharePct, 2),
    whtRate: percent(c.whtRate, 2),
    agent: c.agent ?? null,
    policy: c.policy ?? null,
  };
}
