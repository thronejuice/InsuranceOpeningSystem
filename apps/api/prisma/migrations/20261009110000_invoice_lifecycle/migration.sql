-- Migration: 20261009110000_invoice_lifecycle
-- Day 23 — Invoice (Phase 4)

-- Enums
DO $$ BEGIN
  CREATE TYPE "invoice_type" AS ENUM ('INVOICE', 'DEBIT_NOTE', 'CREDIT_NOTE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "invoice_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Table
CREATE TABLE IF NOT EXISTS "invoices" (
  "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
  "invoice_no"     TEXT          NOT NULL,
  "policy_id"      UUID          NOT NULL,
  "customer_id"    UUID          NOT NULL,
  "type"           "invoice_type" NOT NULL DEFAULT 'INVOICE',
  "installment_no" INTEGER,
  "amount"         DECIMAL(15,2) NOT NULL,
  "net_amount"     DECIMAL(15,2) NOT NULL,
  "stamp_duty"     DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vat"            DECIMAL(15,2) NOT NULL DEFAULT 0,
  "due_date"       DATE          NOT NULL,
  "status"         "invoice_status" NOT NULL DEFAULT 'PENDING',
  "cancelled_at"   TIMESTAMPTZ(3),
  "cancelled_by_id" UUID,
  "created_by_id"  UUID,
  "updated_by_id"  UUID,
  "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- Unique + indexes
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_no_key" ON "invoices"("invoice_no");
CREATE INDEX IF NOT EXISTS "invoices_policy_id_idx"   ON "invoices"("policy_id");
CREATE INDEX IF NOT EXISTS "invoices_customer_id_idx" ON "invoices"("customer_id");
CREATE INDEX IF NOT EXISTS "invoices_status_idx"      ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "invoices_due_date_idx"    ON "invoices"("due_date");

-- Foreign keys
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_cancelled_by_id_fkey"
    FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

