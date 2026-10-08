-- AlterEnum
ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'APPROVAL_REJECTED';
ALTER TYPE "proposal_status" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- CreateTable: payment_terms
CREATE TABLE IF NOT EXISTS "payment_terms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "interval_months" INTEGER NOT NULL DEFAULT 0,
    "first_due_days" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_terms_code_key" ON "payment_terms"("code");

-- AlterTable: proposals
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "payment_term_id" UUID;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "coverage_summary" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "terms" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "conditions" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proposals_payment_term_id_idx" ON "proposals"("payment_term_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposals_payment_term_id_fkey'
    ) THEN
        ALTER TABLE "proposals" ADD CONSTRAINT "proposals_payment_term_id_fkey"
            FOREIGN KEY ("payment_term_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

