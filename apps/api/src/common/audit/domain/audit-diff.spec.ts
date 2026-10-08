import { describe, expect, it } from 'vitest';
import { diffChanges } from './audit-diff.js';

describe('diffChanges', () => {
  it('returns null when both objects are empty', () => {
    expect(diffChanges({}, {})).toBeNull();
  });

  it('returns null when objects have identical values', () => {
    const a = { grossPremium: '10000', discount: '500', name: 'Plan A' };
    const b = { grossPremium: '10000', discount: '500', name: 'Plan A' };
    expect(diffChanges(a, b)).toBeNull();
  });

  it('ignores updatedAt, createdAt, and version by default', () => {
    const a = {
      grossPremium: '10000',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      version: 1,
    };
    const b = {
      grossPremium: '10000',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      version: 2,
    };
    expect(diffChanges(a, b)).toBeNull();
  });

  it('detects single field change (e.g. quotation premium)', () => {
    const before = {
      grossPremium: '100000',
      discount: '0',
      totalAmount: '107000',
      version: 1,
    };
    const after = {
      grossPremium: '95000',
      discount: '0',
      totalAmount: '101650',
      version: 2,
    };
    const diff = diffChanges(before, after);

    expect(diff).toEqual({
      oldValue: {
        grossPremium: '100000',
        totalAmount: '107000',
      },
      newValue: {
        grossPremium: '95000',
        totalAmount: '101650',
      },
    });
  });

  it('handles Decimal-like objects with toString()', () => {
    const dec100 = { toString: () => '100.00', toFixed: () => '100.00' };
    const dec90 = { toString: () => '90.00', toFixed: () => '90.00' };

    const diff = diffChanges({ premium: dec100 }, { premium: dec90 });
    expect(diff).toEqual({
      oldValue: { premium: '100.00' },
      newValue: { premium: '90.00' },
    });
  });

  it('handles added and removed fields', () => {
    const before = { a: 1, b: 'old' };
    const after = { a: 1, c: 'new' };

    const diff = diffChanges(before, after);
    expect(diff).toEqual({
      oldValue: { b: 'old' },
      newValue: { c: 'new' },
    });
  });

  it('handles null / undefined safely', () => {
    expect(diffChanges(null, null)).toBeNull();
    expect(diffChanges(null, { a: 1 })).toEqual({
      oldValue: {},
      newValue: { a: 1 },
    });
    expect(diffChanges({ a: 1 }, null)).toEqual({
      oldValue: { a: 1 },
      newValue: {},
    });
  });
});

