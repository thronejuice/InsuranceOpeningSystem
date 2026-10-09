-- Migration: 20261009120000_payment_receipt_ar
-- Day 24 — Payment ผูก Invoice, Receipt, reminder tracking (Phase 4)

-- Notification type
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'PAYMENT_DUE';

-- Receipt status enum
DO $$ BEGIN
  CREATE TYPE "receipt_status" AS ENUM ('ISSUED', 'VOID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Payment: link to invoice + bank + attachment (legacy V1 rows keep invoice_id NULL)
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "bank"          TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_id"    UUID,
  ADD COLUMN IF NOT EXISTS "attachment_id" UUID;

CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments"("invoice_id");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_attachment_id_fkey"
    FOREIGN KEY ("attachment_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice: de-duplicate daily reminders
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "due_reminder_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "overdue_notified_at"  TIMESTAMPTZ(3);

-- Receipt
CREATE TABLE IF NOT EXISTS "receipts" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "receipt_no"    TEXT           NOT NULL,
  "payment_id"    UUID           NOT NULL,
  "invoice_id"    UUID           NOT NULL,
  "amount"        DECIMAL(15,2)  NOT NULL,
  "status"        "receipt_status" NOT NULL DEFAULT 'ISSUED',
  "issued_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "voided_at"     TIMESTAMPTZ(3),
  "void_reason"   TEXT,
  "voided_by_id"  UUID,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipts_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "receipts_receipt_no_key" ON "receipts"("receipt_no");
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_payment_id_key" ON "receipts"("payment_id");
CREATE INDEX IF NOT EXISTS "receipts_invoice_id_idx" ON "receipts"("invoice_id");
CREATE INDEX IF NOT EXISTS "receipts_status_idx"     ON "receipts"("status");

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_voided_by_id_fkey"
    FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "receipts_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
