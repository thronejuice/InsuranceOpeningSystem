import { Decimal } from 'decimal.js';

/**
 * Formatting helpers for the customer-facing proposal PDF (pure, no I/O).
 * Dates are shown in Buddhist Era, Asia/Bangkok; money uses 2 decimals with thousands separators.
 */

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * `@db.Date` columns come back as UTC midnight, timestamps are real instants — both are
 * rendered as the Bangkok calendar date, e.g. 2026-10-06 → "6 ต.ค. 2569".
 */
export function formatThaiDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })
    .format(date)
    .split('-')
    .map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

/** "12345.6" → "12,345.60"; null/empty → "-" */
export function formatMoney(value: Decimal.Value | { toString(): string } | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const fixed = new Decimal(value.toString()).toFixed(2);
  const [int, frac] = fixed.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

/** Rate is stored as Decimal(10,6); trailing zeros are dropped ("1.250000" → "1.25"). */
export function formatRate(value: { toString(): string } | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Decimal(value.toString()).toString();
}

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/**
 * Reads a non-negative integer string of up to 6 digits (one "ล้าน" group).
 * `hasHigher` = a non-empty ล้าน group precedes it, so a lone trailing 1 reads "เอ็ด" (1,000,001 → หนึ่งล้านเอ็ด).
 */
function readGroup(group: string, hasHigher = false): string {
  const digits = group.replace(/^0+/, '');
  let text = '';
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const n = Number(digits[i]);
    const pos = len - i - 1;
    if (n === 0) continue;
    if (pos === 0 && n === 1 && (len > 1 || hasHigher)) text += 'เอ็ด';
    else if (pos === 1 && n === 2) text += 'ยี่';
    else if (pos === 1 && n === 1) text += '';
    else text += DIGITS[n];
    text += POSITIONS[pos];
  }
  return text;
}

/** Reads any non-negative integer string, splitting into ล้าน groups from the right. */
function readInteger(intStr: string): string {
  const digits = intStr.replace(/^0+/, '');
  if (digits === '') return '';
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 6) {
    groups.unshift(digits.slice(Math.max(0, end - 6), end));
  }
  return groups
    .map((g, i) => {
      const text = readGroup(g, i > 0);
      const isLast = i === groups.length - 1;
      return isLast ? text : `${text}ล้าน`;
    })
    .join('');
}

/**
 * Thai baht text as printed on Thai invoices/quotations:
 * 12345 → "หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทถ้วน", 0.5 → "ห้าสิบสตางค์".
 * The amount is rounded half-up to satang first.
 */
export function thaiBahtText(value: Decimal.Value | { toString(): string }): string {
  const amount = new Decimal(value.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (amount.isZero()) return 'ศูนย์บาทถ้วน';
  const negative = amount.isNegative();
  const [intPart, satangPart] = amount.abs().toFixed(2).split('.');
  const baht = readInteger(intPart);
  const satang = readInteger(satangPart);

  let text = '';
  if (baht) text += `${baht}บาท`;
  text += satang ? `${satang}สตางค์` : 'ถ้วน';
  return negative ? `ลบ${text}` : text;
}

/** Risk field types that make no sense on paper (uploaded files, raw JSON). */
export const HIDDEN_RISK_FIELD_TYPES = new Set(['FILE', 'JSON']);

/** JobRiskValue.fieldValue is always a string; render it per its field type. */
export function formatRiskValue(fieldType: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return '-';
  switch (fieldType) {
    case 'DATE':
      return formatThaiDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
    case 'BOOLEAN':
      return value === 'true' ? 'ใช่ / Yes' : value === 'false' ? 'ไม่ใช่ / No' : value;
    case 'NUMBER': {
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      const [int, frac] = value.trim().split('.');
      return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac !== undefined ? `.${frac}` : ''}`;
    }
    case 'MULTI_SELECT':
      try {
        const arr: unknown = JSON.parse(value);
        return Array.isArray(arr) ? arr.map(String).join(', ') || '-' : value;
      } catch {
        return value;
      }
    default:
      return value;
  }
}
