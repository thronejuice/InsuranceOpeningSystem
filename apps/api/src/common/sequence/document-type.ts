/** DESIGN §5.2 — `yearly: false` means the counter never resets (stored with year = 0). */
export const DOCUMENT_TYPES = {
  CUSTOMER: { prefix: 'CUS', yearly: false },
  JOB: { prefix: 'JOB', yearly: true },
  QUOTATION: { prefix: 'QT', yearly: true },
  PROPOSAL: { prefix: 'PP', yearly: true },
  POLICY: { prefix: 'PL', yearly: true },
  PAYMENT: { prefix: 'PAY', yearly: true },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const RUNNING_DIGITS = 6;
const BUSINESS_TIMEZONE = 'Asia/Bangkok';

/** Documents belong to the Bangkok calendar year, so 2026-12-31T18:00Z is already 2027. */
export function businessYear(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIMEZONE, year: 'numeric' }).format(date));
}

export function formatDocumentNo(type: DocumentType, year: number, value: number): string {
  const { prefix, yearly } = DOCUMENT_TYPES[type];
  const running = String(value).padStart(RUNNING_DIGITS, '0');
  return yearly ? `${prefix}-${year}-${running}` : `${prefix}-${running}`;
}
