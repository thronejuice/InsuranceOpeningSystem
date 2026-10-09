-- Migration for Day 20: Policy Lifecycle V2
-- 1. Extend policy_status enum with DRAFT, EXPIRING, EXPIRED, CANCEL_REQUESTED, RENEWED
ALTER TYPE "policy_status" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "policy_status" ADD VALUE IF NOT EXISTS 'EXPIRING';
ALTER TYPE "policy_status" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "policy_status" ADD VALUE IF NOT EXISTS 'CANCEL_REQUESTED';
ALTER TYPE "policy_status" ADD VALUE IF NOT EXISTS 'RENEWED';

-- 2. Extend notification_type enum with POLICY_EXPIRING
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'POLICY_EXPIRING';

-- 3. Add deductible and policy_document_id to policies table
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "deductible" DECIMAL(15, 2);
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "policy_document_id" UUID;

-- 4. Foreign key constraint for policy_document_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policies_policy_document_id_fkey'
  ) THEN
    ALTER TABLE "policies"
      ADD CONSTRAINT "policies_policy_document_id_fkey"
      FOREIGN KEY ("policy_document_id")
      REFERENCES "documents"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Index for policy_document_id
CREATE INDEX IF NOT EXISTS "policies_policy_document_id_idx" ON "policies"("policy_document_id");

