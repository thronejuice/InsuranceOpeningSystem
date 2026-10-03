import { describe, expect, it } from 'vitest';
import { evaluateApprovalRules, type ApprovalRuleInput } from './approval-rules.js';

// Mirrors seed-data.ts APPROVAL_RULES (3 canonical rules)
const RULES: ApprovalRuleInput[] = [
  { conditionField: 'PREMIUM',  conditionOperator: 'LT',  thresholdValue: { toString: () => '100000.00' }, approverRole: 'SUPERVISOR', active: true },
  { conditionField: 'PREMIUM',  conditionOperator: 'GTE', thresholdValue: { toString: () => '100000.00' }, approverRole: 'MANAGER',    active: true },
  { conditionField: 'DISCOUNT', conditionOperator: 'GT',  thresholdValue: { toString: () => '10.00' },     approverRole: 'MANAGER',    active: true },
];

describe('evaluateApprovalRules', () => {
  it('returns null when no rules are active', () => {
    const inactive = RULES.map(r => ({ ...r, active: false }));
    expect(evaluateApprovalRules('50000.00', '0', inactive)).toBeNull();
  });

  it('returns null when no rules match (empty rules)', () => {
    expect(evaluateApprovalRules('50000.00', '0', [])).toBeNull();
  });

  // ─── Spec rules ───────────────────────────────────────────────────────────

  it('PREMIUM < 100,000 → SUPERVISOR', () => {
    expect(evaluateApprovalRules('50000.00', '0', RULES)).toBe('SUPERVISOR');
  });

  it('PREMIUM >= 100,000 → MANAGER', () => {
    expect(evaluateApprovalRules('150000.00', '0', RULES)).toBe('MANAGER');
  });

  it('DISCOUNT > 10% with low premium → MANAGER (higher priority wins)', () => {
    expect(evaluateApprovalRules('50000.00', '15.00', RULES)).toBe('MANAGER');
  });

  // ─── Boundaries ───────────────────────────────────────────────────────────

  it('99,999.99 → SUPERVISOR (just below threshold)', () => {
    expect(evaluateApprovalRules('99999.99', '0', RULES)).toBe('SUPERVISOR');
  });

  it('100,000.00 → MANAGER (at threshold, GTE matches)', () => {
    expect(evaluateApprovalRules('100000.00', '0', RULES)).toBe('MANAGER');
  });

  it('discount exactly 10.00% → SUPERVISOR only (GT is strict, 10 is not > 10)', () => {
    // Rule 3 uses GT, so exactly 10% does NOT trigger MANAGER from discount rule
    // Rule 1 still matches (PREMIUM LT 100000), so result is SUPERVISOR
    expect(evaluateApprovalRules('50000.00', '10.00', RULES)).toBe('SUPERVISOR');
  });

  it('discount 10.01% → MANAGER (just above GT threshold)', () => {
    expect(evaluateApprovalRules('50000.00', '10.01', RULES)).toBe('MANAGER');
  });

  // ─── Inactive rule ignored ────────────────────────────────────────────────

  it('inactive rules are skipped', () => {
    const noDiscount = RULES.map((r, i) => i === 2 ? { ...r, active: false } : r);
    // premium 50k, discount 15% but discount rule inactive → only SUPERVISOR
    expect(evaluateApprovalRules('50000.00', '15.00', noDiscount)).toBe('SUPERVISOR');
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
