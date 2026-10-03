import { describe, expect, it } from 'vitest';
import { flattenPermissions, generateRefreshToken, hashRefreshToken, refreshTokenExpiry } from './refresh-token.js';

describe('refresh-token', () => {
  it('generates unique url-safe tokens of 256 bits', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically without storing the raw token', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toContain('abc');
    expect(hashRefreshToken('abc')).toHaveLength(64);
  });

  it('computes expiry in days', () => {
    expect(refreshTokenExpiry(new Date('2026-01-01T00:00:00Z'), 7).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('flattens permissions across roles, de-duplicated and sorted', () => {
    const role = (...codes: string[]) => ({ permissions: codes.map((code) => ({ permission: { code } })) });
    expect(flattenPermissions([role('job.view', 'customer.view'), role('job.view', 'job.create')])).toEqual([
      'customer.view',
      'job.create',
      'job.view',
    ]);
  });
});
