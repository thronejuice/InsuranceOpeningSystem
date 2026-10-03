import { describe, expect, it } from 'vitest';
import { maskThaiId, validateThaiId } from './thai-id.validator.js';

// Computed valid IDs (first 12 digits × weights 13..2, check = (11 - sum%11) % 10)
// 1234567890121: sum=352, 352%11=0, check=1  ✓
// 0105544090768: sum=245, 245%11=3, check=8  ✓
const VALID_CITIZEN_ID = '1234567890121';
const VALID_TAX_ID = '0105544090768';

describe('validateThaiId', () => {
  it('accepts a valid citizen ID', () => {
    expect(validateThaiId(VALID_CITIZEN_ID)).toBe(true);
  });

  it('rejects ID with wrong check digit', () => {
    expect(validateThaiId('1234567890122')).toBe(false);
  });

  it('rejects all-zero except last', () => {
    expect(validateThaiId('0000000000000')).toBe(false);
  });

  it('rejects non-13-digit strings', () => {
    expect(validateThaiId('123456789012')).toBe(false);
    expect(validateThaiId('12345678901234')).toBe(false);
  });

  it('rejects non-numeric string', () => {
    expect(validateThaiId('123456789012A')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateThaiId('')).toBe(false);
  });

  it('accepts a valid tax ID (corporate, same algorithm)', () => {
    expect(validateThaiId(VALID_TAX_ID)).toBe(true);
  });

  it('rejects tax ID with wrong check digit', () => {
    expect(validateThaiId('0105544090765')).toBe(false);
  });
});

describe('maskThaiId', () => {
  it('masks middle digits and keeps first and last', () => {
    expect(maskThaiId(VALID_CITIZEN_ID)).toBe('1-2345-xxxxx-xx-1');
  });

  it('returns the original value when length is not 13', () => {
    expect(maskThaiId('123')).toBe('123');
  });

  it('returns the original value for empty string', () => {
    expect(maskThaiId('')).toBe('');
  });
});
