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

export interface ApprovalViewer {
  userId?: string;
  permissions: string[];
  roles?: string[];
}

export function getRolePriority(roleCode: string): number {
  if (ROLE_PRIORITY[roleCode]) return ROLE_PRIORITY[roleCode];
  const upper = roleCode.toUpperCase();
  if (upper.includes('ADMIN')) return ROLE_PRIORITY.ADMIN;
  if (upper.includes('MANAGER') || upper.endsWith('MGR')) return ROLE_PRIORITY.MANAGER;
  if (upper.includes('SUPERVISOR') || upper.endsWith('SUP')) return ROLE_PRIORITY.SUPERVISOR;
  return 0;
}

/**
 * Whether the user holds sufficient role priority to decide (approve or reject)
 * a request of type `approvalType`.
 * Priority order: SUPERVISOR (1) < MANAGER (2) < ADMIN (3).
 * If approvalType is omitted or not recognized, any user with approval permission may decide.
 */
export function canApproveType(
  approvalType: string | null | undefined,
  userRoles: string[],
): boolean {
  if (!approvalType || !(approvalType in ROLE_PRIORITY)) return true;
  const required = ROLE_PRIORITY[approvalType] ?? 0;
  const userMax = Math.max(0, ...userRoles.map(getRolePriority));
  return userMax >= required;
}

/**
 * Maker-checker: the requester may not decide their own request,
 * unless they hold `approval.approve_own` (ADMIN by default).
 */
export function isSelfDecisionBlocked(requestedById: string | null, viewer: ApprovalViewer): boolean {
  return requestedById === viewer.userId && !viewer.permissions.includes('approval.approve_own');
}

/**
 * Whether the viewer may approve/reject: the request is still PENDING, the viewer holds
 * `approval.approve`, maker-checker does not block them, and viewer role is >= approvalType.
 */
export function canDecideApproval(
  approval: { status: string; requestedById: string | null; approvalType?: string | null },
  viewer: ApprovalViewer,
): boolean {
  return (
    approval.status === 'PENDING' &&
    viewer.permissions.includes('approval.approve') &&
    !!viewer.userId &&
    !isSelfDecisionBlocked(approval.requestedById, viewer) &&
    canApproveType(approval.approvalType, viewer.roles ?? [])
  );
}
