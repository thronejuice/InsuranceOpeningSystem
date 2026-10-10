import { Decimal } from 'decimal.js';

export interface ProRataInput {
  effectiveDate: Date | string;
  expiryDate: Date | string;
  endorsementDate: Date | string;
  annualNetPremium: Decimal | string | number;
}

export interface ProRataResult {
  totalDays: number;
  remainingDays: number;
  dailyRate: Decimal;
  proRataNet: Decimal;
  stampDuty: Decimal;
  vat: Decimal;
  totalAdjustment: Decimal;
}

/**
 * Normalizes input date to midnight (00:00:00.000) in Bangkok time.
 */
function toMidnight(d: Date | string): Date {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj); // YYYY-MM-DD
  return new Date(`${parts}T00:00:00+07:00`);
}

/**
 * Calculates daily pro-rata premium adjustment according to D-15.
 * Remaining days = (expiryDate - endorsementDate) in days.
 * Pro-rata Net = (annualNetPremium / totalDays) * remainingDays (rounded 2 decimals).
 * Stamp duty = ceil(proRataNet * 0.004)
 * VAT = round2((proRataNet + stampDuty) * 0.07)
 */
export function calculateProRataPremium(input: ProRataInput): ProRataResult {
  const eff = toMidnight(input.effectiveDate);
  const exp = toMidnight(input.expiryDate);
  const end = toMidnight(input.endorsementDate);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((exp.getTime() - eff.getTime()) / MS_PER_DAY));
  const remainingDays = Math.max(0, Math.min(totalDays, Math.round((exp.getTime() - end.getTime()) / MS_PER_DAY)));

  const annualNet = new Decimal(input.annualNetPremium).abs();
  const dailyRate = annualNet.dividedBy(totalDays);
  const proRataNet = dailyRate.times(remainingDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const stampDuty = proRataNet.times('0.004').ceil();
  const vat = proRataNet.plus(stampDuty).times('0.07').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalAdjustment = proRataNet.plus(stampDuty).plus(vat);

  return {
    totalDays,
    remainingDays,
    dailyRate,
    proRataNet,
    stampDuty,
    vat,
    totalAdjustment,
  };
}

