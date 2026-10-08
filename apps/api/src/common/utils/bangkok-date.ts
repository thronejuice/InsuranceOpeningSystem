/**
 * Date utilities with Asia/Bangkok timezone support.
 */

/**
 * Returns the date formatted as YYYY-MM-DD in the Asia/Bangkok (UTC+7) timezone.
 * Defaults to current timestamp if no date is provided.
 */
export function todayInBangkok(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date ?? new Date());
}
