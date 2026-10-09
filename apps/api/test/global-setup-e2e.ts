import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DOCUMENT_TYPES, businessYear, type DocumentType } from '../src/common/sequence/document-type.js';

/**
 * Runs once before the whole e2e suite (vitest `globalSetup`, not per-file `setupFiles`).
 *
 * `document_sequences.last_value` must never be behind the highest running number already
 * committed for that (prefix, year) — otherwise `SequenceService.next()` reissues an already-used
 * number and the insert fails with a unique constraint violation (quotation_no / job_no / ...).
 * Drift happens because a transaction can reserve a number via the sequence's UPSERT and then
 * roll back for an unrelated reason later in the same request, so the increment is undone while
 * other, unrelated successful runs already used higher numbers. Re-sync defensively on every run.
 */
export default async function setup() {
  config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
  const databaseUrl = process.env['DATABASE_URL_TEST'];
  if (!databaseUrl) return;

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const year = businessYear(new Date());

  try {
    for (const type of Object.keys(DOCUMENT_TYPES) as DocumentType[]) {
      const { prefix, yearly } = DOCUMENT_TYPES[type];
      const seqYear = yearly ? year : 0;
      // Only consider the running-number format this prefix actually produces (PREFIX-YYYY-NNNNNN
      // or PREFIX-NNNNNN), never ad-hoc fixture values like "JOB-PAYTEST-001".
      const pattern = yearly ? `${prefix}-${seqYear}-%` : `${prefix}-%`;
      const column = columnForPrefix(prefix);
      if (!column) continue;

      const rows = await prisma.$queryRawUnsafe<{ max_no: string | null }[]>(
        `SELECT MAX(${column}) AS max_no FROM ${tableForPrefix(prefix)} WHERE ${column} LIKE $1 AND ${column} ~ $2`,
        pattern,
        yearly ? `^${prefix}-${seqYear}-\\d+$` : `^${prefix}-\\d+$`,
      );
      const maxNo = rows[0]?.max_no;
      if (!maxNo) continue;
      const maxValue = Number(maxNo.split('-').pop());
      if (!Number.isFinite(maxValue) || maxValue <= 0) continue;

      await prisma.$executeRawUnsafe(
        `INSERT INTO document_sequences (prefix, year, last_value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (prefix, year) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, $3)`,
        prefix,
        seqYear,
        maxValue,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

function tableForPrefix(prefix: string): string | null {
  return { CUS: 'customers', JOB: 'jobs', QT: 'quotations', PP: 'proposals', PL: 'policies', PAY: 'payments', INV: 'invoices', RC: 'receipts', CS: 'commission_statements' }[prefix] ?? null;
}

function columnForPrefix(prefix: string): string | null {
  return {
    CUS: 'customer_code',
    JOB: 'job_no',
    QT: 'quotation_no',
    PP: 'proposal_no',
    PL: 'policy_no',
    PAY: 'payment_no',
    INV: 'invoice_no',
    RC: 'receipt_no',
    CS: 'statement_no',
  }[prefix] ?? null;
}
