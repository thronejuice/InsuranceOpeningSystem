import { Decimal } from 'decimal.js';

export interface InstallmentSchedule {
  installmentNo: number;
  amount: Decimal;
  netAmount: Decimal;
  stampDuty: Decimal;
  vat: Decimal;
  dueDate: Date;
}

export interface PaymentTermInput {
  installments: number;
  intervalMonths: number;
  firstDueDays: number;
}

/**
 * Calculates due date for a specific installment given base issue date and payment term.
 * - Installment 1: issueDate + firstDueDays (e.g. 30 days)
 * - Installment i (i > 1): Add (i - 1) * intervalMonths to installment 1's dueDate,
 *   safely clamping to the last day of the target month if necessary.
 */
export function calculateDueDate(baseDate: Date, installmentNo: number, term: PaymentTermInput): Date {
  const d = new Date(baseDate);
  // Installment 1: baseDate + firstDueDays
  d.setDate(d.getDate() + term.firstDueDays);

  if (installmentNo === 1 || term.intervalMonths <= 0) {
    return d;
  }

  // Subsequent installments
  const targetMonths = (installmentNo - 1) * term.intervalMonths;
  const originalDay = d.getDate();
  const year = d.getFullYear();
  const month = d.getMonth();

  // Create date at 1st of target month
  const targetDate = new Date(year, month + targetMonths, 1);
  // Find max days in that month:
  // e.g. new Date(year, month + targetMonths + 1, 0).getDate()
  const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  targetDate.setDate(Math.min(originalDay, daysInMonth));

  return targetDate;
}

/**
 * Splits netAmount, stampDuty, vat, and totalAmount into N installments.
 * - Divides amounts equally rounded down to 2 decimal places.
 * - Residual differences (rounding error) are added to the final installment so that:
 *   sum(installments) === totalAmount exactly.
 */
export function calculateInstallments(
  totalAmount: Decimal | string | number,
  netAmount: Decimal | string | number,
  stampDuty: Decimal | string | number,
  vat: Decimal | string | number,
  paymentTerm: PaymentTermInput,
  issueDate: Date,
): InstallmentSchedule[] {
  const totalDec = new Decimal(totalAmount);
  const netDec = new Decimal(netAmount);
  const stampDec = new Decimal(stampDuty);
  const vatDec = new Decimal(vat);

  const n = Math.max(1, paymentTerm.installments || 1);

  if (n === 1) {
    return [
      {
        installmentNo: 1,
        amount: totalDec,
        netAmount: netDec,
        stampDuty: stampDec,
        vat: vatDec,
        dueDate: calculateDueDate(issueDate, 1, paymentTerm),
      },
    ];
  }

  // Base shares rounded to 2 decimal places
  const baseNet = netDec.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const baseStamp = stampDec.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const baseVat = vatDec.dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);

  let accumulatedNet = new Decimal(0);
  let accumulatedStamp = new Decimal(0);
  let accumulatedVat = new Decimal(0);
  let accumulatedTotal = new Decimal(0);

  const schedules: InstallmentSchedule[] = [];

  for (let i = 1; i <= n; i++) {
    const isLast = i === n;
    const curNet = isLast ? netDec.minus(accumulatedNet) : baseNet;
    const curStamp = isLast ? stampDec.minus(accumulatedStamp) : baseStamp;
    const curVat = isLast ? vatDec.minus(accumulatedVat) : baseVat;

    // Installment total amount = curNet + curStamp + curVat (or adjusted to totalDec on last)
    let curAmount = curNet.plus(curStamp).plus(curVat);
    if (isLast) {
      curAmount = totalDec.minus(accumulatedTotal);
    }

    accumulatedNet = accumulatedNet.plus(curNet);
    accumulatedStamp = accumulatedStamp.plus(curStamp);
    accumulatedVat = accumulatedVat.plus(curVat);
    accumulatedTotal = accumulatedTotal.plus(curAmount);

    schedules.push({
      installmentNo: i,
      amount: curAmount,
      netAmount: curNet,
      stampDuty: curStamp,
      vat: curVat,
      dueDate: calculateDueDate(issueDate, i, paymentTerm),
    });
  }

  return schedules;
}

