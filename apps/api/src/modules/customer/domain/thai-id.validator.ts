/**
 * Thai National ID (บัตรประชาชน) and Tax ID (เลขประจำตัวผู้เสียภาษี) share the same
 * 13-digit Luhn-like checksum defined by the Revenue Department.
 */

/** Verify the 13-digit Thai ID checksum (weights 13..2, check = (11 - sum%11) % 10). */
export function validateThaiId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(id[12]);
}

/** Mask middle digits: `X-XXXX-XXXXX-XX-X` → `d-dddd-xxxxx-xx-d` */
export function maskThaiId(id: string): string {
  if (!id || id.length !== 13) return id;
  return `${id[0]}-${id.slice(1, 5)}-xxxxx-xx-${id[12]}`;
}
