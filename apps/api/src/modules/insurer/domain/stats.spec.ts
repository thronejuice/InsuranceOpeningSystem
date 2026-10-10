import { describe, expect, it } from 'vitest';
import { computeInsurerStats } from './stats.js';

describe('computeInsurerStats', () => {
  it('returns zeros and a 0.00 win rate when there is no data', () => {
    expect(computeInsurerStats([], [])).toEqual({
      quotations: { total: 0, received: 0, selected: 0 },
      winRatePct: '0.00',
      policies: { issued: 0, cancelled: 0 },
      issuedPremium: '0.00',
      cancelledPremium: '0.00',
    });
  });

  it('win rate = selected ÷ received; requested and cancelled quotations are not received', () => {
    const stats = computeInsurerStats(
      [
        { status: 'REQUESTED', count: 4 },
        { status: 'CANCELLED', count: 1 },
        { status: 'RECEIVED', count: 2 },
        { status: 'SELECTED', count: 1 },
        { status: 'EXPIRED', count: 1 },
      ],
      [],
    );
    expect(stats.quotations).toEqual({ total: 9, received: 4, selected: 1 });
    expect(stats.winRatePct).toBe('25.00');
  });

  it('rounds the win rate half up to 2 decimals', () => {
    const stats = computeInsurerStats([{ status: 'SELECTED', count: 1 }, { status: 'RECEIVED', count: 5 }], []);
    expect(stats.winRatePct).toBe('16.67'); // 1/6
  });

  it('sums premium exactly (no float drift) and keeps cancelled policies apart', () => {
    const stats = computeInsurerStats([], [
      { status: 'ACTIVE', count: 2, premium: '0.10' },
      { status: 'EXPIRED', count: 1, premium: '0.20' },
      { status: 'DRAFT', count: 5, premium: '999.00' },
      { status: 'CANCELLED', count: 1, premium: '1500.50' },
    ]);
    expect(stats.issuedPremium).toBe('0.30');
    expect(stats.policies).toEqual({ issued: 3, cancelled: 1 });
    expect(stats.cancelledPremium).toBe('1500.50');
  });
});
