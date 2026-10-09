-- CreateEnum: binding_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'binding_status') THEN
        CREATE TYPE "binding_status" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'CANCELLED');
    END IF;
END $$;

-- AlterTable: bindings
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "status" "binding_status" NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "binder_number" TEXT;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "binder_date" DATE;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "insurer_id" UUID;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "premium" DECIMAL(15,2);
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "payment_condition" TEXT;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "underwriter" TEXT;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "binder_document_id" UUID;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(3);
ALTER TABLE "bindings" ADD COLUMN IF NOT EXISTS "cancelled_by_id" UUID;

-- AlterTable: jobs
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" TIMESTAMPTZ(3);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancel_requested_by_id" UUID;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancel_request_reason" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(3);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancelled_by_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bindings_insurer_id_idx" ON "bindings"("insurer_id");
CREATE INDEX IF NOT EXISTS "bindings_status_idx" ON "bindings"("status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bindings_insurer_id_fkey'
    ) THEN
        ALTER TABLE "bindings" ADD CONSTRAINT "bindings_insurer_id_fkey"
        FOREIGN KEY ("insurer_id") REFERENCES "insurance_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bindings_binder_document_id_fkey'
    ) THEN
        ALTER TABLE "bindings" ADD CONSTRAINT "bindings_binder_document_id_fkey"
        FOREIGN KEY ("binder_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

