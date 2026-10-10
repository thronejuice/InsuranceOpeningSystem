import { Decimal } from 'decimal.js';

export interface ShortRateEntry {
  daysFrom: number;
  daysTo: number;
  ratePercent: Decimal | string | number;
  description?: string | null;
}

export interface CancellationCalcInput {
  effectiveDate: Date | string;
  expiryDate: Date | string;
  cancelEffectiveDate: Date | string;
  annualNetPremium: Decimal | string | number;
  shortRateTable?: ShortRateEntry[];
  /**
   * If true or if shortRateTable is not used, calculates pro-rata refund.
   * By default, customer-initiated cancellation may use short-rate, insurer-initiated uses pro-rata.
   */
  method?: 'PRO_RATA' | 'SHORT_RATE';
}

export interface CancellationCalcResult {
  totalDays: number;
  daysUsed: number;
  remainingDays: number;
  retentionPercent: Decimal; // % retained by insurer
  refundPercent: Decimal;    // % refunded to customer
  refundNet: Decimal;
  stampDuty: Decimal;
  vat: Decimal;
  totalRefund: Decimal;
  method: 'PRO_RATA' | 'SHORT_RATE';
}

/**
 * Standard OIC / Thai market Short-Rate retention table sample (OQ-7).
 * daysFrom - daysTo -> % retained by insurer.
 */
export const DEFAULT_SHORT_RATE_TABLE: ShortRateEntry[] = [
  { daysFrom: 1, daysTo: 9, ratePercent: '15', description: 'ไม่เกิน 9 วัน หัก 15%' },
  { daysFrom: 10, daysTo: 15, ratePercent: '20', description: 'ไม่เกิน 15 วัน หัก 20%' },
  { daysFrom: 16, daysTo: 30, ratePercent: '25', description: 'ไม่เกิน 30 วัน หัก 25%' },
  { daysFrom: 31, daysTo: 45, ratePercent: '30', description: 'ไม่เกิน 45 วัน หัก 30%' },
  { daysFrom: 46, daysTo: 60, ratePercent: '35', description: 'ไม่เกิน 60 วัน หัก 35%' },
  { daysFrom: 61, daysTo: 75, ratePercent: '40', description: 'ไม่เกิน 75 วัน หัก 40%' },
  { daysFrom: 76, daysTo: 90, ratePercent: '45', description: 'ไม่เกิน 90 วัน หัก 45%' },
  { daysFrom: 91, daysTo: 105, ratePercent: '50', description: 'ไม่เกิน 105 วัน หัก 50%' },
  { daysFrom: 106, daysTo: 120, ratePercent: '55', description: 'ไม่เกิน 120 วัน หัก 55%' },
  { daysFrom: 121, daysTo: 135, ratePercent: '60', description: 'ไม่เกิน 135 วัน หัก 60%' },
  { daysFrom: 136, daysTo: 150, ratePercent: '65', description: 'ไม่เกิน 150 วัน หัก 65%' },
  { daysFrom: 151, daysTo: 165, ratePercent: '70', description: 'ไม่เกิน 165 วัน หัก 70%' },
  { daysFrom: 166, daysTo: 180, ratePercent: '75', description: 'ไม่เกิน 180 วัน หัก 75%' },
  { daysFrom: 181, daysTo: 195, ratePercent: '78', description: 'ไม่เกิน 195 วัน หัก 78%' },
  { daysFrom: 196, daysTo: 210, ratePercent: '80', description: 'ไม่เกิน 210 วัน หัก 80%' },
  { daysFrom: 211, daysTo: 225, ratePercent: '83', description: 'ไม่เกิน 225 วัน หัก 83%' },
  { daysFrom: 226, daysTo: 240, ratePercent: '85', description: 'ไม่เกิน 240 วัน หัก 85%' },
  { daysFrom: 241, daysTo: 255, ratePercent: '88', description: 'ไม่เกิน 255 วัน หัก 88%' },
  { daysFrom: 256, daysTo: 270, ratePercent: '90', description: 'ไม่เกิน 270 วัน หัก 90%' },
  { daysFrom: 271, daysTo: 365, ratePercent: '100', description: 'เกิน 270 วัน หัก 100% (ไม่มีเบี้ยคืน)' },
];

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
 * Calculates policy cancellation refund based on Short-Rate or Pro-Rata.
 */
export function calculateCancellationRefund(input: CancellationCalcInput): CancellationCalcResult {
  const eff = toMidnight(input.effectiveDate);
  const exp = toMidnight(input.expiryDate);
  const cancelEff = toMidnight(input.cancelEffectiveDate);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((exp.getTime() - eff.getTime()) / MS_PER_DAY));
  // days used = cancelEffectiveDate - effectiveDate
  const rawDaysUsed = Math.round((cancelEff.getTime() - eff.getTime()) / MS_PER_DAY);
  const daysUsed = Math.max(0, Math.min(totalDays, rawDaysUsed));
  const remainingDays = Math.max(0, totalDays - daysUsed);

  const annualNet = new Decimal(input.annualNetPremium).abs();
  const method = input.method ?? 'SHORT_RATE';

  let retentionPercent = new Decimal(0);
  let refundPercent = new Decimal(0);

  if (method === 'PRO_RATA') {
    if (totalDays > 0) {
      refundPercent = new Decimal(remainingDays).dividedBy(totalDays).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      retentionPercent = new Decimal(100).minus(refundPercent);
    }
  } else {
    // SHORT_RATE
    const table = (input.shortRateTable && input.shortRateTable.length > 0)
      ? input.shortRateTable
      : DEFAULT_SHORT_RATE_TABLE;

    if (daysUsed === 0) {
      // 0 days used before effective date -> 100% refund
      retentionPercent = new Decimal(0);
      refundPercent = new Decimal(100);
    } else {
      const match = table.find((entry) => daysUsed >= entry.daysFrom && daysUsed <= entry.daysTo);
      if (match) {
        retentionPercent = new Decimal(match.ratePercent.toString());
      } else {
        // If exceeds max in table or not found
        retentionPercent = daysUsed >= totalDays ? new Decimal(100) : new Decimal(100);
      }
      refundPercent = Decimal.max(0, new Decimal(100).minus(retentionPercent));
    }
  }

  const refundNet = annualNet.times(refundPercent).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const stampDuty = refundNet.times('0.004').ceil();
  const vat = refundNet.plus(stampDuty).times('0.07').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalRefund = refundNet.plus(stampDuty).plus(vat);

  return {
    totalDays,
    daysUsed,
    remainingDays,
    retentionPercent,
    refundPercent,
    refundNet,
    stampDuty,
    vat,
    totalRefund,
    method,
  };
}

