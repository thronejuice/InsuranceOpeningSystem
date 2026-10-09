import { Decimal } from 'decimal.js';

export type InvoiceStatusValue = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

const BUSINESS_TIMEZONE = 'Asia/Bangkok';
const bangkokDay = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE });

/** 'YYYY-MM-DD' of the Bangkok calendar day that `date` falls in. */
export function bangkokDateString(date: Date): string {
  return bangkokDay.format(date);
}

/** `due_date` is a DATE column, so Prisma hands back UTC midnight of the calendar date itself. */
export function dueDateString(dueDate: Date | string): string {
  return dueDate instanceof Date ? dueDate.toISOString().slice(0, 10) : dueDate.slice(0, 10);
}

export function outstandingAmount(amount: string | Decimal, paid: string | Decimal): Decimal {
  const out = new Decimal(amount).minus(paid);
  return out.isNegative() ? new Decimal(0) : out;
}

export interface InvoiceStatusInput {
  status: InvoiceStatusValue;
  amount: string | Decimal;
  paid: string | Decimal;
  dueDate: Date | string;
  now: Date;
}

/**
 * Status derived from money + calendar (V2 §Invoice): fully paid wins over overdue; anything still
 * owed after its Bangkok due date is OVERDUE (even when part-paid); CANCELLED is terminal.
 */
export function computeInvoiceStatus(input: InvoiceStatusInput): InvoiceStatusValue {
  if (input.status === 'CANCELLED') return 'CANCELLED';

  const outstanding = outstandingAmount(input.amount, input.paid);
  if (outstanding.isZero()) return 'PAID';

  if (dueDateString(input.dueDate) < bangkokDateString(input.now)) return 'OVERDUE';

  return new Decimal(input.paid).greaterThan(0) ? 'PARTIALLY_PAID' : 'PENDING';
}
