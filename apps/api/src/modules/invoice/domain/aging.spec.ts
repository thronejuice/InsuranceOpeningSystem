import { describe, expect, it } from 'vitest';
import { agingBucket, daysOverdue } from './aging.js';

const NOW = new Date('2026-10-09T05:00:00Z'); // 2026-10-09 Bangkok
const daysAgo = (n: number) => {
  const d = new Date('2026-10-09T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

describe('daysOverdue', () => {
  it('is 0 on the due date, positive after, negative before', () => {
    expect(daysOverdue(daysAgo(0), NOW)).toBe(0);
    expect(daysOverdue(daysAgo(7), NOW)).toBe(7);
    expect(daysOverdue(daysAgo(-3), NOW)).toBe(-3);
  });

  it('counts Bangkok days, not UTC days', () => {
    // 2026-10-09T18:00Z is already 2026-10-10 in Bangkok
    expect(daysOverdue(daysAgo(0), new Date('2026-10-09T18:00:00Z'))).toBe(1);
  });
});

describe('agingBucket', () => {
  it.each([
    [-5, 'NOT_DUE'],
    [0, 'NOT_DUE'],
    [1, 'D0_30'],
    [30, 'D0_30'],
    [31, 'D31_60'],
    [60, 'D31_60'],
    [61, 'D61_90'],
    [90, 'D61_90'],
    [91, 'D90_PLUS'],
    [400, 'D90_PLUS'],
  ])('%i days overdue -> %s', (days, bucket) => {
    expect(agingBucket(daysAgo(days), NOW)).toBe(bucket);
  });

  it('accepts a string due date', () => {
    expect(agingBucket('2026-09-09', NOW)).toBe('D0_30'); // 30 days
  });
});
