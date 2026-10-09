-- Migration: 20261009140000_commission_adjustment_statement
-- Day 27 — Commission adjustments (signed, never edit the original) and monthly payee statements

DO $$ BEGIN
  CREATE TYPE "commission_adjustment_status" AS ENUM ('PENDING', 'IN_STATEMENT', 'SETTLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "commission_statement_status" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "commission_statements" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "statement_no"  TEXT           NOT NULL,
  "agent_id"      UUID           NOT NULL,
  "period"        TEXT           NOT NULL,
  "period_end"    DATE           NOT NULL,
  "status"        "commission_statement_status" NOT NULL DEFAULT 'DRAFT',
  "share_total"   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  "wht_total"     DECIMAL(15,2)  NOT NULL DEFAULT 0,
  "net_total"     DECIMAL(15,2)  NOT NULL DEFAULT 0,
  "confirmed_at"  TIMESTAMPTZ(3),
  "paid_at"       TIMESTAMPTZ(3),
  "paid_date"     DATE,
  "payment_ref"   TEXT,
  "paid_by_id"    UUID,
  "cancelled_at"  TIMESTAMPTZ(3),
  "cancel_reason" TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "commission_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_statements_period_format" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- A statement can only be confirmed or paid while it nets to zero or more
  CONSTRAINT "commission_statements_confirmed_nonnegative" CHECK ("status" NOT IN ('CONFIRMED', 'PAID') OR "net_total" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "commission_statements_statement_no_key" ON "commission_statements"("statement_no");
CREATE INDEX IF NOT EXISTS "commission_statements_agent_id_period_idx" ON "commission_statements"("agent_id", "period");
CREATE INDEX IF NOT EXISTS "commission_statements_status_idx" ON "commission_statements"("status");
-- One live statement per payee per month: concurrent "create statement" calls cannot double up
CREATE UNIQUE INDEX IF NOT EXISTS "commission_statements_agent_period_live_key"
  ON "commission_statements"("agent_id", "period") WHERE "status" <> 'CANCELLED';

ALTER TABLE "commission_statements"
  ADD CONSTRAINT "commission_statements_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_statements_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_statements_paid_by_id_fkey"
    FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "statement_id" UUID;
CREATE INDEX IF NOT EXISTS "commissions_statement_id_idx" ON "commissions"("statement_id");
ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_statement_id_fkey"
    FOREIGN KEY ("statement_id") REFERENCES "commission_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "commission_adjustments" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "commission_id" UUID           NOT NULL,
  "policy_id"     UUID           NOT NULL,
  "agent_id"      UUID           NOT NULL,
  "amount"        DECIMAL(15,2)  NOT NULL,
  "wht_rate"      DECIMAL(5,2)   NOT NULL,
  "wht_amount"    DECIMAL(15,2)  NOT NULL,
  "net_amount"    DECIMAL(15,2)  NOT NULL,
  "reason"        TEXT           NOT NULL,
  "ref_type"      TEXT,
  "ref_id"        TEXT,
  "status"        "commission_adjustment_status" NOT NULL DEFAULT 'PENDING',
  "statement_id"  UUID,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "commission_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_adjustments_amount_nonzero" CHECK ("amount" <> 0),
  CONSTRAINT "commission_adjustments_net_check" CHECK ("net_amount" = "amount" - "wht_amount"),
  CONSTRAINT "commission_adjustments_ref_pair" CHECK (("ref_type" IS NULL) = ("ref_id" IS NULL)),
  CONSTRAINT "commission_adjustments_statement_state" CHECK (("status" = 'PENDING') = ("statement_id" IS NULL))
);

CREATE INDEX IF NOT EXISTS "commission_adjustments_commission_id_idx" ON "commission_adjustments"("commission_id");
CREATE INDEX IF NOT EXISTS "commission_adjustments_agent_id_status_idx" ON "commission_adjustments"("agent_id", "status");
CREATE INDEX IF NOT EXISTS "commission_adjustments_statement_id_idx" ON "commission_adjustments"("statement_id");

ALTER TABLE "commission_adjustments"
  ADD CONSTRAINT "commission_adjustments_commission_id_fkey"
    FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_adjustments_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_adjustments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_adjustments_statement_id_fkey"
    FOREIGN KEY ("statement_id") REFERENCES "commission_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
