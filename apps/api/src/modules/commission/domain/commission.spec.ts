import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { CommissionShareError, computeCommissionBreakdown, type CommissionInput } from './commission.js';

const base: CommissionInput = {
  netPremium: '10000.00',
  ratePct: '15',
  agentSharePct: '50',
  overridePct: '0',
  whtPct: '3',
  hasManager: false,
};

describe('computeCommissionBreakdown', () => {
  it('splits gross between agent and broker with WHT on the agent only', () => {
    const r = computeCommissionBreakdown(base);
    expect(r.gross).toBe('1500.00');
    expect(r.agent).toEqual({ sharePct: '50.00', shareAmount: '750.00', whtAmount: '22.50', netAmount: '727.50' });
    expect(r.override).toBeNull();
    expect(r.brokerShare).toBe('750.00');
    expect(r.whtPct).toBe('3.00');
  });

  it('adds a manager override carved out of the broker share, each payee with its own WHT', () => {
    const r = computeCommissionBreakdown({ ...base, overridePct: '10', hasManager: true });
    expect(r.gross).toBe('1500.00');
    expect(r.agent.shareAmount).toBe('750.00');
    expect(r.override).toEqual({ sharePct: '10.00', shareAmount: '150.00', whtAmount: '4.50', netAmount: '145.50' });
    expect(r.brokerShare).toBe('600.00');
  });

  it('ignores the override when the agent has no manager', () => {
    const r = computeCommissionBreakdown({ ...base, overridePct: '10', hasManager: false });
    expect(r.override).toBeNull();
    expect(r.brokerShare).toBe('750.00');
  });

  it('ignores a 0% override even when there is a manager', () => {
    expect(computeCommissionBreakdown({ ...base, hasManager: true }).override).toBeNull();
  });

  it('always sums back to gross to the satang, whatever the rounding', () => {
    for (const net of ['1234.56', '99999.99', '0.07', '3333.33', '100.01']) {
      for (const [agent, override] of [['50', '0'], ['33.33', '7.5'], ['66.67', '10'], ['12.345', '1.111']]) {
        const r = computeCommissionBreakdown({
          ...base, netPremium: net, ratePct: '17.5', agentSharePct: agent, overridePct: override, hasManager: true,
        });
        const parts = new Decimal(r.agent.shareAmount).plus(r.override?.shareAmount ?? 0).plus(r.brokerShare);
        expect(parts.toFixed(2)).toBe(r.gross);
      }
    }
  });

  it('rounds half-up to satang', () => {
    // 10.05 × 10% = 1.005 → 1.01 (half-up), not the 1.00 that binary floats give
    expect(computeCommissionBreakdown({ ...base, netPremium: '10.05', ratePct: '10' }).gross).toBe('1.01');
    // share 0.50 (of gross 1.01 at 50% = 0.505 → 0.51)
    expect(computeCommissionBreakdown({ ...base, netPremium: '10.05', ratePct: '10' }).agent.shareAmount).toBe('0.51');
  });

  it('net = share − WHT with WHT rounded half-up', () => {
    // 0.51 × 3% = 0.0153 → 0.02
    const r = computeCommissionBreakdown({ ...base, netPremium: '10.05', ratePct: '10' });
    expect(r.agent.whtAmount).toBe('0.02');
    expect(r.agent.netAmount).toBe('0.49');
  });

  it('handles a zero rate, zero WHT and a 100% agent share', () => {
    expect(computeCommissionBreakdown({ ...base, ratePct: '0' }).gross).toBe('0.00');
    expect(computeCommissionBreakdown({ ...base, whtPct: '0' }).agent.netAmount).toBe('750.00');
    const all = computeCommissionBreakdown({ ...base, agentSharePct: '100' });
    expect(all.brokerShare).toBe('0.00');
  });

  it('rejects shares that add up to more than 100%', () => {
    expect(() => computeCommissionBreakdown({ ...base, agentSharePct: '95', overridePct: '10', hasManager: true })).toThrow(CommissionShareError);
    // but an override that does not apply (no manager) is not counted
    expect(() => computeCommissionBreakdown({ ...base, agentSharePct: '95', overridePct: '10', hasManager: false })).not.toThrow();
  });

  it('accepts exactly 100% across agent and override', () => {
    const r = computeCommissionBreakdown({ ...base, agentSharePct: '90', overridePct: '10', hasManager: true });
    expect(r.brokerShare).toBe('0.00');
  });
});
