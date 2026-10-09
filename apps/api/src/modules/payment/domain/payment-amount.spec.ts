import { describe, expect, it } from 'vitest';
import { checkPaymentAmount } from './payment-amount.js';

describe('checkPaymentAmount (OQ-4)', () => {
  it('accepts a partial payment and an exact settlement', () => {
    expect(checkPaymentAmount('0.01', '100.00')).toBe('OK');
    expect(checkPaymentAmount('100.00', '100.00')).toBe('OK');
  });

  it('rejects zero and negative amounts', () => {
    expect(checkPaymentAmount('0', '100.00')).toBe('NOT_POSITIVE');
    expect(checkPaymentAmount('-5.00', '100.00')).toBe('NOT_POSITIVE');
  });

  it('rejects anything over the outstanding amount, even by one satang', () => {
    expect(checkPaymentAmount('100.01', '100.00')).toBe('EXCEEDS_OUTSTANDING');
    expect(checkPaymentAmount('0.01', '0.00')).toBe('EXCEEDS_OUTSTANDING');
  });

  it('is exact for amounts that floats get wrong', () => {
    expect(checkPaymentAmount('0.30', '0.10')).toBe('EXCEEDS_OUTSTANDING');
    expect(checkPaymentAmount('0.30', '0.30')).toBe('OK');
  });
});
