import { Decimal } from 'decimal.js';

export type ApproverRole = 'SUPERVISOR' | 'MANAGER' | 'ADMIN';

const ROLE_PRIORITY: Record<string, number> = { SUPERVISOR: 1, MANAGER: 2, ADMIN: 3 };

export interface ApprovalRuleInput {
  conditionField: string;
  conditionOperator: string;
  thresholdValue: { toString(): string };
  approverRole: string;
  active: boolean;
}

function check(value: Decimal, op: string, threshold: Decimal): boolean {
  switch (op) {
    case 'LT':  return value.lt(threshold);
    case 'LTE': return value.lte(threshold);
    case 'GT':  return value.gt(threshold);
    case 'GTE': return value.gte(threshold);
    case 'EQ':  return value.eq(threshold);
    default:    return false;
  }
}

/**
 * Evaluate active approval rules against netPremium and discountPercent (0–100).
 * Returns the highest-priority matching approver role, or null if no rule matches.
 */
export function evaluateApprovalRules(
  netPremium: string,
  discountPercent: string,
  rules: ApprovalRuleInput[],
): ApproverRole | null {
  const net = new Decimal(netPremium);
  const disc = new Decimal(discountPercent);
  let highest: ApproverRole | null = null;

  for (const rule of rules) {
    if (!rule.active) continue;
    const threshold = new Decimal(rule.thresholdValue.toString());
    let value: Decimal;
    if (rule.conditionField === 'PREMIUM') {
      value = net;
    } else if (rule.conditionField === 'DISCOUNT') {
      value = disc;
    } else {
      continue;
    }
    if (check(value, rule.conditionOperator, threshold)) {
      const role = rule.approverRole as ApproverRole;
      if (!highest || ROLE_PRIORITY[role] > ROLE_PRIORITY[highest]) {
        highest = role;
      }
    }
  }
  return highest;
}
