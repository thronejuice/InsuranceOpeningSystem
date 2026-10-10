-- Migration: 20261009160000_phase5_endorsement_cancellation_refund
-- Phase 5 — Endorsement, Policy Versions, Cancellation, Refunds

-- Enums
DO $$ BEGIN
  CREATE TYPE "endorsement_type" AS ENUM (
    'CHANGE_CUSTOMER',
    'CHANGE_ADDRESS',
    'CHANGE_COVERAGE',
    'CHANGE_SUM_INSURED',
    'ADD_ASSET',
    'REMOVE_ASSET',
    'CHANGE_VEHICLE',
    'CHANGE_EFFECTIVE_DATE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "endorsement_status" AS ENUM (
    'DRAFT',
    'REQUESTED',
    'REVIEWING',
    'APPROVED',
    'REJECTED',
    'ISSUED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "premium_adjustment_type" AS ENUM (
    'ADDITIONAL_PREMIUM',
    'REFUND_PREMIUM',
    'NO_CHANGE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "refund_status" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'PROCESSED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policy Cancellation fields
ALTER TABLE "policies"
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancel_request_date" DATE,
  ADD COLUMN IF NOT EXISTS "cancel_effective_date" DATE,
  ADD COLUMN IF NOT EXISTS "cancel_insurer_document_id" UUID,
  ADD COLUMN IF NOT EXISTS "cancel_refund_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "cancel_outstanding_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "cancelled_by_id" UUID;

ALTER TABLE "policies"
  DROP CONSTRAINT IF EXISTS "policies_cancel_insurer_document_id_fkey",
  ADD CONSTRAINT "policies_cancel_insurer_document_id_fkey"
    FOREIGN KEY ("cancel_insurer_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policies"
  DROP CONSTRAINT IF EXISTS "policies_cancelled_by_id_fkey",
  ADD CONSTRAINT "policies_cancelled_by_id_fkey"
    FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table endorsements
CREATE TABLE IF NOT EXISTS "endorsements" (
  "id"                      UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "endorsement_no"          TEXT                      NOT NULL,
  "policy_id"               UUID                      NOT NULL,
  "type"                    "endorsement_type"        NOT NULL,
  "status"                  "endorsement_status"      NOT NULL DEFAULT 'DRAFT',
  "effective_date"          DATE                      NOT NULL,
  "changes"                 JSONB                     NOT NULL,
  "premium_adjustment_type" "premium_adjustment_type" NOT NULL DEFAULT 'NO_CHANGE',
  "net_adjustment"          DECIMAL(15,2)             NOT NULL DEFAULT 0,
  "stamp_duty"              DECIMAL(15,2)             NOT NULL DEFAULT 0,
  "vat"                     DECIMAL(15,2)             NOT NULL DEFAULT 0,
  "total_adjustment"        DECIMAL(15,2)             NOT NULL DEFAULT 0,
  "remark"                  TEXT,
  "rejection_reason"        TEXT,
  "insurer_document_id"     UUID,
  "requested_by_id"         UUID,
  "requested_at"            TIMESTAMPTZ(3),
  "reviewed_by_id"          UUID,
  "reviewed_at"             TIMESTAMPTZ(3),
  "approved_by_id"          UUID,
  "approved_at"             TIMESTAMPTZ(3),
  "issued_by_id"            UUID,
  "issued_at"               TIMESTAMPTZ(3),
  "created_at"              TIMESTAMPTZ(3)            NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ(3)            NOT NULL,

  CONSTRAINT "endorsements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "endorsements_endorsement_no_key" ON "endorsements"("endorsement_no");
CREATE INDEX IF NOT EXISTS "endorsements_policy_id_idx" ON "endorsements"("policy_id");
CREATE INDEX IF NOT EXISTS "endorsements_status_idx"    ON "endorsements"("status");
CREATE INDEX IF NOT EXISTS "endorsements_type_idx"      ON "endorsements"("type");

ALTER TABLE "endorsements"
  DROP CONSTRAINT IF EXISTS "endorsements_policy_id_fkey",
  ADD CONSTRAINT "endorsements_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "endorsements_insurer_document_id_fkey",
  ADD CONSTRAINT "endorsements_insurer_document_id_fkey"
    FOREIGN KEY ("insurer_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "endorsements_requested_by_id_fkey",
  ADD CONSTRAINT "endorsements_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "endorsements_reviewed_by_id_fkey",
  ADD CONSTRAINT "endorsements_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "endorsements_approved_by_id_fkey",
  ADD CONSTRAINT "endorsements_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "endorsements_issued_by_id_fkey",
  ADD CONSTRAINT "endorsements_issued_by_id_fkey"
    FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table policy_versions
CREATE TABLE IF NOT EXISTS "policy_versions" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "policy_id"      UUID         NOT NULL,
  "version"        INTEGER      NOT NULL,
  "snapshot"       JSONB        NOT NULL,
  "reason"         TEXT,
  "endorsement_id" UUID,
  "created_by_id"  UUID,
  "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "policy_versions_policy_id_version_key" ON "policy_versions"("policy_id", "version");
CREATE INDEX IF NOT EXISTS "policy_versions_policy_id_idx" ON "policy_versions"("policy_id");

ALTER TABLE "policy_versions"
  DROP CONSTRAINT IF EXISTS "policy_versions_policy_id_fkey",
  ADD CONSTRAINT "policy_versions_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Table short_rate_tables
CREATE TABLE IF NOT EXISTS "short_rate_tables" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "days_from"    INTEGER      NOT NULL,
  "days_to"      INTEGER      NOT NULL,
  "rate_percent" DECIMAL(5,2) NOT NULL,
  "description"  TEXT,
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "short_rate_tables_pkey" PRIMARY KEY ("id")
);

-- Table refunds
CREATE TABLE IF NOT EXISTS "refunds" (
  "id"               UUID             NOT NULL DEFAULT gen_random_uuid(),
  "refund_no"        TEXT             NOT NULL,
  "credit_note_id"   UUID             NOT NULL,
  "amount"           DECIMAL(15,2)    NOT NULL,
  "status"           "refund_status"  NOT NULL DEFAULT 'REQUESTED',
  "reason"           TEXT,
  "rejection_reason" TEXT,
  "requested_by_id"  UUID,
  "requested_at"     TIMESTAMPTZ(3)   NOT NULL DEFAULT NOW(),
  "approved_by_id"   UUID,
  "approved_at"      TIMESTAMPTZ(3),
  "processed_by_id"  UUID,
  "processed_at"     TIMESTAMPTZ(3),
  "payment_method"   "payment_method",
  "bank"             TEXT,
  "reference_no"     TEXT,
  "attachment_id"    UUID,
  "created_at"       TIMESTAMPTZ(3)   NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ(3)   NOT NULL,

  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refunds_refund_no_key" ON "refunds"("refund_no");
CREATE INDEX IF NOT EXISTS "refunds_credit_note_id_idx"   ON "refunds"("credit_note_id");
CREATE INDEX IF NOT EXISTS "refunds_status_idx"           ON "refunds"("status");

ALTER TABLE "refunds"
  DROP CONSTRAINT IF EXISTS "refunds_credit_note_id_fkey",
  ADD CONSTRAINT "refunds_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "refunds_attachment_id_fkey",
  ADD CONSTRAINT "refunds_attachment_id_fkey"
    FOREIGN KEY ("attachment_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "refunds_requested_by_id_fkey",
  ADD CONSTRAINT "refunds_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "refunds_approved_by_id_fkey",
  ADD CONSTRAINT "refunds_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "refunds_processed_by_id_fkey",
  ADD CONSTRAINT "refunds_processed_by_id_fkey"
    FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

