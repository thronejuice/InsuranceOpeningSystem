import { describe, expect, it } from 'vitest';
import { calculateCommission } from './commission-calc.js';

describe('calculateCommission', () => {
  it('10% of 1000 = 100.00', () => {
    expect(calculateCommission('1000.00', '10')).toBe('100.00');
  });

  it('15.5% of 2000 = 310.00', () => {
    expect(calculateCommission('2000.00', '15.5')).toBe('310.00');
  });

  it('0% = 0.00', () => {
    expect(calculateCommission('5000.00', '0')).toBe('0.00');
  });

  it('100% of 500 = 500.00', () => {
    expect(calculateCommission('500.00', '100')).toBe('500.00');
  });

  it('rounds to 2 decimal places (1.5% of 1000 = 15.00)', () => {
    expect(calculateCommission('1000.00', '1.5')).toBe('15.00');
  });

  it('rounds fractional result (1% of 3333.33 = 33.33)', () => {
    expect(calculateCommission('3333.33', '1')).toBe('33.33');
  });

  it('small base: 2% of 50 = 1.00', () => {
    expect(calculateCommission('50.00', '2')).toBe('1.00');
  });

  it('returns 0.00 for zero base', () => {
    expect(calculateCommission('0.00', '10')).toBe('0.00');
  });

  it('invalid base returns 0.00', () => {
    expect(calculateCommission('abc', '10')).toBe('0.00');
  });

  it('invalid rate returns 0.00', () => {
    expect(calculateCommission('1000', 'xyz')).toBe('0.00');
  });

  it('high precision rate: 12.3456% of 10000 = 1234.56', () => {
    expect(calculateCommission('10000.00', '12.3456')).toBe('1234.56');
  });

  it('large amount: 5% of 1000000 = 50000.00', () => {
    expect(calculateCommission('1000000.00', '5')).toBe('50000.00');
  });
});
