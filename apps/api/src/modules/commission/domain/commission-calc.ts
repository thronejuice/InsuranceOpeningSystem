/**
 * Commission amount = commissionBase × commissionRate / 100, rounded to 2 decimal places.
 * Uses BigInt arithmetic to avoid IEEE-754 float rounding on money values.
 * Inputs match DB types: base Decimal(15,2), rate Decimal(10,4).
 */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function calculateCommission(base: string, rate: string): string {
  if (!DECIMAL_RE.test(base) || !DECIMAL_RE.test(rate)) return '0.00';

  // Shift both operands to integers preserving 6 fractional digits (2+4)
  const toInt6 = (s: string) => {
    const [int = '0', frac = ''] = s.replace('-', '').split('.');
    return BigInt(int + frac.padEnd(6, '0').slice(0, 6)) * (s.startsWith('-') ? -1n : 1n);
  };
  const b6 = toInt6(base);   // e.g. "10000.00" → 10_000_000_000n
  const r6 = toInt6(rate);   // e.g. "15.5000"  →         155_000n

  // b6 * r6 is in units of 10^12; divide by 10^10 to get units of 10^2 (cents)
  // i.e. (base × rate / 100) scaled to 2dp: 10^6 × 10^6 / (10^2 × 10^6 × 10^6) = 1/10^2
  const raw = b6 * r6;                       // units: 10^12
  const divisor = 100n * 10n ** 10n;         // 10^12 — brings back to cents (×100 for the /100 in formula)
  const cents = (raw + divisor / 2n) / divisor; // round-half-up

  const abs = cents < 0n ? -cents : cents;
  const sign = cents < 0n ? '-' : '';
  const intPart = abs / 100n;
  const fracPart = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}
