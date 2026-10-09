-- AlterEnum: notification_type
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'APPROVAL_REJECTED';

-- CreateEnum: approval_entity_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_entity_type') THEN
        CREATE TYPE "approval_entity_type" AS ENUM ('JOB', 'ENDORSEMENT');
    END IF;
END $$;

-- AlterTable: approval_rules
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "entity_type" "approval_entity_type" NOT NULL DEFAULT 'JOB';
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "product_id" UUID;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "insurance_type_id" UUID;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "risk_level" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "approval_rules_entity_type_idx" ON "approval_rules"("entity_type");
CREATE INDEX IF NOT EXISTS "approval_rules_product_id_idx" ON "approval_rules"("product_id");
CREATE INDEX IF NOT EXISTS "approval_rules_insurance_type_id_idx" ON "approval_rules"("insurance_type_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'approval_rules_product_id_fkey'
    ) THEN
        ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'approval_rules_insurance_type_id_fkey'
    ) THEN
        ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_insurance_type_id_fkey"
        FOREIGN KEY ("insurance_type_id") REFERENCES "insurance_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable: approvals
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "reject_reason" TEXT;
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resubmitted_at" TIMESTAMPTZ(3);
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "resubmitted_by_id" UUID;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'approvals_resubmitted_by_id_fkey'
    ) THEN
        ALTER TABLE "approvals" ADD CONSTRAINT "approvals_resubmitted_by_id_fkey"
        FOREIGN KEY ("resubmitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

