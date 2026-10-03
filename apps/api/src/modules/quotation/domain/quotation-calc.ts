import { Decimal } from 'decimal.js';

export interface QuotationInput {
  gross: string;
  discount: string;
  /** Supply to override auto-calc */
  stampDuty?: string;
  /** Supply to override auto-calc */
  tax?: string;
}

export interface QuotationCalcResult {
  net: string;
  stampDuty: string;
  tax: string;
  total: string;
}

/** Q5: stampDuty = ceil(net × 0.004), tax = round2((net + stampDuty) × 0.07) */
export function autoCalc(net: Decimal): { stampDuty: Decimal; tax: Decimal } {
  const stampDuty = net.times('0.004').ceil();
  const tax = net.plus(stampDuty).times('0.07').toDecimalPlaces(2);
  return { stampDuty, tax };
}

export function computeQuotation(input: QuotationInput): QuotationCalcResult {
  const gross = new Decimal(input.gross);
  const discount = new Decimal(input.discount);
  const net = gross.minus(discount);

  const { stampDuty: autoStamp, tax: autoTax } = autoCalc(net);
  const stampDuty = input.stampDuty != null ? new Decimal(input.stampDuty) : autoStamp;
  const tax = input.tax != null ? new Decimal(input.tax) : autoTax;
  const total = net.plus(stampDuty).plus(tax);

  if (total.lessThan(0)) {
    throw new Error('QUOTATION_TOTAL_NEGATIVE');
  }

  return {
    net: net.toFixed(2),
    stampDuty: stampDuty.toFixed(2),
    tax: tax.toFixed(2),
    total: total.toFixed(2),
  };
}
