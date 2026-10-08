import { describe, expect, it } from 'vitest';
import { formatMoney, formatRate, formatRiskValue, formatThaiDate, thaiBahtText } from './proposal-format.js';

describe('formatThaiDate', () => {
  it('renders a @db.Date value in Buddhist Era', () => {
    expect(formatThaiDate(new Date('2026-10-06T00:00:00Z'))).toBe('6 ต.ค. 2569');
  });

  it('uses the Bangkok calendar day for timestamps', () => {
    // 2026-12-31 18:00 UTC = 2027-01-01 01:00 Bangkok
    expect(formatThaiDate(new Date('2026-12-31T18:00:00Z'))).toBe('1 ม.ค. 2570');
  });

  it('returns "-" for empty or invalid values', () => {
    expect(formatThaiDate(null)).toBe('-');
    expect(formatThaiDate('not-a-date')).toBe('-');
  });
});

describe('formatMoney', () => {
  it('adds thousands separators and 2 decimals', () => {
    expect(formatMoney('1234567.5')).toBe('1,234,567.50');
    expect(formatMoney('0')).toBe('0.00');
    expect(formatMoney('-1500')).toBe('-1,500.00');
  });

  it('returns "-" for null', () => {
    expect(formatMoney(null)).toBe('-');
  });
});

describe('formatRate', () => {
  it('drops trailing zeros', () => {
    expect(formatRate('1.250000')).toBe('1.25');
    expect(formatRate(null)).toBe('-');
  });
});

describe('thaiBahtText', () => {
  it.each([
    ['0', 'ศูนย์บาทถ้วน'],
    ['1', 'หนึ่งบาทถ้วน'],
    ['11', 'สิบเอ็ดบาทถ้วน'],
    ['21', 'ยี่สิบเอ็ดบาทถ้วน'],
    ['101', 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    ['12345', 'หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทถ้วน'],
    ['1000000', 'หนึ่งล้านบาทถ้วน'],
    ['1000001', 'หนึ่งล้านเอ็ดบาทถ้วน'],
    ['21000000', 'ยี่สิบเอ็ดล้านบาทถ้วน'],
    ['1250000.75', 'หนึ่งล้านสองแสนห้าหมื่นบาทเจ็ดสิบห้าสตางค์'],
    ['0.5', 'ห้าสิบสตางค์'],
    ['100.01', 'หนึ่งร้อยบาทหนึ่งสตางค์'],
  ])('%s → %s', (amount, text) => {
    expect(thaiBahtText(amount)).toBe(text);
  });

  it('rounds half-up to satang', () => {
    expect(thaiBahtText('10.005')).toBe('สิบบาทหนึ่งสตางค์');
  });
});

describe('formatRiskValue', () => {
  it.each([
    ['TEXT', 'กข 1234', 'กข 1234'],
    ['TEXT', '', '-'],
    ['DATE', '2026-10-06', '6 ต.ค. 2569'],
    ['BOOLEAN', 'true', 'ใช่ / Yes'],
    ['BOOLEAN', 'false', 'ไม่ใช่ / No'],
    ['NUMBER', '1500000', '1,500,000'],
    ['NUMBER', '1234.5', '1,234.5'],
    ['MULTI_SELECT', '["fire","flood"]', 'fire, flood'],
    ['MULTI_SELECT', 'not json', 'not json'],
  ])('%s %s → %s', (type, value, expected) => {
    expect(formatRiskValue(type, value)).toBe(expected);
  });
});
