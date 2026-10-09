-- Migration: 20261009130000_commission_v2_calculation
-- Day 26 — Commission V2 (calculate): breakdown columns, PAYABLE status, system settings, agent share

ALTER TYPE "commission_status" ADD VALUE IF NOT EXISTS 'PAYABLE';

-- Agent's share of gross commission (NULL = use the system default)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "agent_share_pct" DECIMAL(5,2),
  ADD CONSTRAINT "users_agent_share_pct_range" CHECK ("agent_share_pct" IS NULL OR ("agent_share_pct" >= 0 AND "agent_share_pct" <= 100));

-- Per-payee breakdown (V1 manual rows keep these NULL)
ALTER TABLE "commissions"
  ADD COLUMN IF NOT EXISTS "gross_amount"        DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "share_pct"           DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "broker_share_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "wht_rate"            DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "wht_amount"          DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "net_amount"          DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "rate_source"         TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at"         TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "approved_by_id"      UUID,
  ADD COLUMN IF NOT EXISTS "payable_at"          TIMESTAMPTZ(3);

ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "commissions_v2_amounts_check" CHECK (
    "gross_amount" IS NULL OR (
      "gross_amount" >= 0 AND "net_amount" >= 0 AND "wht_amount" >= 0
      AND "net_amount" = "commission_amount" - "wht_amount"
    )
  );

-- At most one live calculated commission per payee type per policy: makes the calculation idempotent
-- even under concurrent issue/recalculate calls. V1 manual rows (gross_amount IS NULL) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS "commissions_policy_type_calculated_key"
  ON "commissions"("policy_id", "commission_type")
  WHERE "gross_amount" IS NOT NULL AND "status" <> 'CANCELLED';

-- System settings (key/value, percent values stored as decimal strings)
CREATE TABLE IF NOT EXISTS "system_settings" (
  "key"           TEXT           NOT NULL,
  "value"         TEXT           NOT NULL,
  "description"   TEXT,
  "updated_by_id" UUID,
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
