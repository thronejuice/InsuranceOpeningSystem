import { describe, expect, it } from 'vitest';
import { canApproveType, canDecideApproval, evaluateApprovalRules, isSelfDecisionBlocked, type ApprovalRuleInput } from './approval-rules.js';

// Canonical V2 rules per D-8: Premium >= 100k -> MANAGER, Discount > 10% -> MANAGER
const RULES_V2: ApprovalRuleInput[] = [
  { conditionField: 'PREMIUM',  conditionOperator: 'GTE', thresholdValue: { toString: () => '100000.00' }, approverRole: 'MANAGER',    active: true },
  { conditionField: 'DISCOUNT', conditionOperator: 'GT',  thresholdValue: { toString: () => '10.00' },     approverRole: 'MANAGER',    active: true },
];

describe('evaluateApprovalRules', () => {
  it('returns null when no rules are active', () => {
    const inactive = RULES_V2.map(r => ({ ...r, active: false }));
    expect(evaluateApprovalRules('50000.00', '0', inactive)).toBeNull();
  });

  it('returns null when no rules match (empty rules)', () => {
    expect(evaluateApprovalRules('50000.00', '0', [])).toBeNull();
  });

  // ─── D-8 Seed rules (premium < 100,000 does NOT require approval) ─────────

  it('PREMIUM < 100,000 with 0% discount → null (no approval required per D-8)', () => {
    expect(evaluateApprovalRules('50000.00', '0', RULES_V2)).toBeNull();
  });

  it('PREMIUM 50,000 with 5% discount → null (no approval required)', () => {
    expect(evaluateApprovalRules('50000.00', '5.00', RULES_V2)).toBeNull();
  });

  it('PREMIUM >= 100,000 → MANAGER', () => {
    expect(evaluateApprovalRules('100000.00', '0', RULES_V2)).toBe('MANAGER');
    expect(evaluateApprovalRules('150000.00', '0', RULES_V2)).toBe('MANAGER');
  });

  it('DISCOUNT > 10% with low premium (< 100,000) → MANAGER', () => {
    expect(evaluateApprovalRules('50000.00', '15.00', RULES_V2)).toBe('MANAGER');
  });

  // ─── Boundaries ───────────────────────────────────────────────────────────

  it('99,999.99 with discount 10.00% → null (both rules just below/not meeting threshold)', () => {
    expect(evaluateApprovalRules('99999.99', '10.00', RULES_V2)).toBeNull();
  });

  it('discount 10.01% with 50,000 premium → MANAGER (just above GT threshold)', () => {
    expect(evaluateApprovalRules('50000.00', '10.01', RULES_V2)).toBe('MANAGER');
  });

  // ─── Inactive rule ignored ────────────────────────────────────────────────

  it('inactive rules are skipped', () => {
    const inactiveDiscount = RULES_V2.map((r) => r.conditionField === 'DISCOUNT' ? { ...r, active: false } : r);
    expect(evaluateApprovalRules('50000.00', '15.00', inactiveDiscount)).toBeNull();
  });

  // ─── Contextual filtering (productId, insuranceTypeId, riskLevel, entityType) ──

  it('filters rules by productId', () => {
    const productRule: ApprovalRuleInput = {
      conditionField: 'PREMIUM',
      conditionOperator: 'GTE',
      thresholdValue: { toString: () => '30000.00' },
      approverRole: 'SUPERVISOR',
      productId: 'prod-motor',
      active: true,
    };

    // When product matches
    expect(
      evaluateApprovalRules(
        { netPremium: '35000.00', discountPercent: '0', productId: 'prod-motor' },
        [productRule],
      ),
    ).toBe('SUPERVISOR');

    // When product does not match
    expect(
      evaluateApprovalRules(
        { netPremium: '35000.00', discountPercent: '0', productId: 'prod-other' },
        [productRule],
      ),
    ).toBeNull();
  });

  it('filters rules by insuranceTypeId', () => {
    const typeRule: ApprovalRuleInput = {
      conditionField: 'PREMIUM',
      conditionOperator: 'GTE',
      thresholdValue: { toString: () => '40000.00' },
      approverRole: 'SUPERVISOR',
      insuranceTypeId: 'type-fire',
      active: true,
    };

    expect(
      evaluateApprovalRules(
        { netPremium: '50000.00', discountPercent: '0', insuranceTypeId: 'type-fire' },
        [typeRule],
      ),
    ).toBe('SUPERVISOR');

    expect(
      evaluateApprovalRules(
        { netPremium: '50000.00', discountPercent: '0', insuranceTypeId: 'type-marine' },
        [typeRule],
      ),
    ).toBeNull();
  });

  it('filters rules by riskLevel', () => {
    const highRiskRule: ApprovalRuleInput = {
      conditionField: 'PREMIUM',
      conditionOperator: 'GTE',
      thresholdValue: { toString: () => '10000.00' },
      approverRole: 'MANAGER',
      riskLevel: 'HIGH',
      active: true,
    };

    expect(
      evaluateApprovalRules(
        { netPremium: '20000.00', discountPercent: '0', riskLevel: 'HIGH' },
        [highRiskRule],
      ),
    ).toBe('MANAGER');

    expect(
      evaluateApprovalRules(
        { netPremium: '20000.00', discountPercent: '0', riskLevel: 'LOW' },
        [highRiskRule],
      ),
    ).toBeNull();
  });

  it('filters rules by entityType (JOB vs ENDORSEMENT)', () => {
    const endorsementRule: ApprovalRuleInput = {
      conditionField: 'PREMIUM',
      conditionOperator: 'GTE',
      thresholdValue: { toString: () => '10000.00' },
      approverRole: 'SUPERVISOR',
      entityType: 'ENDORSEMENT',
      active: true,
    };

    // Evaluated for JOB context -> does not match
    expect(
      evaluateApprovalRules(
        { netPremium: '20000.00', discountPercent: '0', entityType: 'JOB' },
        [endorsementRule],
      ),
    ).toBeNull();

    // Evaluated for ENDORSEMENT context -> matches
    expect(
      evaluateApprovalRules(
        { netPremium: '20000.00', discountPercent: '0', entityType: 'ENDORSEMENT' },
        [endorsementRule],
      ),
    ).toBe('SUPERVISOR');
  });

  // ─── Unknown conditionField ───────────────────────────────────────────────

  it('unknown conditionField is skipped gracefully', () => {
    const weirdRule: ApprovalRuleInput = {
      conditionField: 'UNKNOWN',
      conditionOperator: 'GT',
      thresholdValue: { toString: () => '0' },
      approverRole: 'ADMIN',
      active: true,
    };
    expect(evaluateApprovalRules('50000.00', '0', [weirdRule])).toBeNull();
  });
});

describe('canDecideApproval', () => {
  const pending = { status: 'PENDING', requestedById: 'maker' };
  const checker = { userId: 'checker', permissions: ['approval.approve'] };

  it('allows another user with approval.approve on a PENDING request', () => {
    expect(canDecideApproval(pending, checker)).toBe(true);
  });

  it('blocks the requester from deciding their own request', () => {
    expect(canDecideApproval(pending, { ...checker, userId: 'maker' })).toBe(false);
  });

  it('blocks a viewer without approval.approve', () => {
    expect(canDecideApproval(pending, { userId: 'checker', permissions: [] })).toBe(false);
  });

  it('blocks when the request is no longer PENDING', () => {
    expect(canDecideApproval({ ...pending, status: 'APPROVED' }, checker)).toBe(false);
  });

  it('lets a requester holding approval.approve_own decide their own request', () => {
    expect(canDecideApproval(pending, { userId: 'maker', permissions: ['approval.approve', 'approval.approve_own'] })).toBe(true);
  });

  it('blocks when there is no current user', () => {
    expect(canDecideApproval(pending, { permissions: ['approval.approve'] })).toBe(false);
  });
});

describe('isSelfDecisionBlocked', () => {
  it('blocks the requester without approval.approve_own', () => {
    expect(isSelfDecisionBlocked('u1', { userId: 'u1', permissions: ['approval.approve'] })).toBe(true);
  });

  it('allows the requester with approval.approve_own', () => {
    expect(isSelfDecisionBlocked('u1', { userId: 'u1', permissions: ['approval.approve_own'] })).toBe(false);
  });

  it('never blocks a different user', () => {
    expect(isSelfDecisionBlocked('u1', { userId: 'u2', permissions: [] })).toBe(false);
  });
});

describe('canApproveType', () => {
  it('allows SUPERVISOR, MANAGER, ADMIN to approve SUPERVISOR level', () => {
    expect(canApproveType('SUPERVISOR', ['SUPERVISOR'])).toBe(true);
    expect(canApproveType('SUPERVISOR', ['MANAGER'])).toBe(true);
    expect(canApproveType('SUPERVISOR', ['ADMIN'])).toBe(true);
    expect(canApproveType('SUPERVISOR', ['AGENT'])).toBe(false);
  });

  it('blocks SUPERVISOR from approving MANAGER level, allows MANAGER and ADMIN', () => {
    expect(canApproveType('MANAGER', ['SUPERVISOR'])).toBe(false);
    expect(canApproveType('MANAGER', ['MANAGER'])).toBe(true);
    expect(canApproveType('MANAGER', ['ADMIN'])).toBe(true);
  });

  it('only allows ADMIN to approve ADMIN level', () => {
    expect(canApproveType('ADMIN', ['SUPERVISOR'])).toBe(false);
    expect(canApproveType('ADMIN', ['MANAGER'])).toBe(false);
    expect(canApproveType('ADMIN', ['ADMIN'])).toBe(true);
  });

  it('allows any user if approvalType is null, undefined, or unrecognized', () => {
    expect(canApproveType(null, ['AGENT'])).toBe(true);
    expect(canApproveType(undefined, [])).toBe(true);
    expect(canApproveType('UNKNOWN', ['AGENT'])).toBe(true);
  });
});
