import { Decimal } from 'decimal.js';

/**
 * Commission V2 split (D-13, OQ-5/6, D26 decisions):
 *
 *   gross       = net premium × insurer rate
 *   agentShare  = gross × agent share %
 *   override    = gross × override %            (only when the agent has a manager)
 *   brokerShare = gross − agentShare − override (the company's own income — no WHT)
 *   WHT         = each payee's share × WHT %    (withheld from agent / manager payouts)
 *   net         = share − WHT
 *
 * Every amount is rounded half-up to satang and the broker share is the remainder, so
 * agentShare + override + brokerShare always equals gross to the satang.
 */

export interface CommissionInput {
  /** Policy net premium (Decimal string). */
  netPremium: string;
  /** Insurer commission rate in percent, e.g. "12.5". */
  ratePct: string;
  /** Agent's share of gross in percent. */
  agentSharePct: string;
  /** Override share of gross in percent, paid to the agent's manager. */
  overridePct: string;
  /** Withholding tax in percent, applied to each payee's share. */
  whtPct: string;
  hasManager: boolean;
}

export interface PayeeAmounts {
  sharePct: string;
  shareAmount: string;
  whtAmount: string;
  netAmount: string;
}

export interface CommissionBreakdown {
  gross: string;
  agent: PayeeAmounts;
  /** null when there is no manager or the override rate is 0. */
  override: PayeeAmounts | null;
  brokerShare: string;
  whtPct: string;
}

export class CommissionShareError extends Error {
  constructor(public readonly totalPct: string) {
    super(`Agent share + override exceeds 100% (${totalPct}%)`);
  }
}

const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const pct = (base: Decimal, p: Decimal) => round2(base.mul(p).div(100));

function payee(share: Decimal, sharePct: Decimal, whtPct: Decimal): PayeeAmounts {
  const wht = pct(share, whtPct);
  return {
    sharePct: sharePct.toFixed(2),
    shareAmount: share.toFixed(2),
    whtAmount: wht.toFixed(2),
    netAmount: share.minus(wht).toFixed(2),
  };
}

export function computeCommissionBreakdown(input: CommissionInput): CommissionBreakdown {
  const agentPct = new Decimal(input.agentSharePct);
  const overridePct = input.hasManager ? new Decimal(input.overridePct) : new Decimal(0);
  const whtPct = new Decimal(input.whtPct);

  const totalPct = agentPct.plus(overridePct);
  if (totalPct.greaterThan(100)) throw new CommissionShareError(totalPct.toFixed(2));

  const gross = pct(new Decimal(input.netPremium), new Decimal(input.ratePct));
  const agentShare = pct(gross, agentPct);
  const overrideShare = overridePct.isZero() ? new Decimal(0) : pct(gross, overridePct);
  const brokerShare = gross.minus(agentShare).minus(overrideShare);

  return {
    gross: gross.toFixed(2),
    agent: payee(agentShare, agentPct, whtPct),
    override: overridePct.isZero() ? null : payee(overrideShare, overridePct, whtPct),
    brokerShare: brokerShare.toFixed(2),
    whtPct: whtPct.toFixed(2),
  };
}
