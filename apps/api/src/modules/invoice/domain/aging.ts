import { bangkokDateString, dueDateString } from './invoice-status.js';

export type AgingBucket = 'NOT_DUE' | 'D0_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export const AGING_BUCKETS: readonly AgingBucket[] = ['NOT_DUE', 'D0_30', 'D31_60', 'D61_90', 'D90_PLUS'];

const MS_PER_DAY = 86_400_000;

/** Whole calendar days (Bangkok) past the due date; 0 on the due date itself, negative before it. */
export function daysOverdue(dueDate: Date | string, now: Date): number {
  const due = Date.parse(`${dueDateString(dueDate)}T00:00:00Z`);
  const today = Date.parse(`${bangkokDateString(now)}T00:00:00Z`);
  return Math.round((today - due) / MS_PER_DAY);
}

/**
 * An invoice is not overdue on its due date. D0_30 is "1–30 days past due" — the "0" in the
 * report label only means the first bucket after the due date.
 */
export function agingBucket(dueDate: Date | string, now: Date): AgingBucket {
  const days = daysOverdue(dueDate, now);
  if (days <= 0) return 'NOT_DUE';
  if (days <= 30) return 'D0_30';
  if (days <= 60) return 'D31_60';
  if (days <= 90) return 'D61_90';
  return 'D90_PLUS';
}
