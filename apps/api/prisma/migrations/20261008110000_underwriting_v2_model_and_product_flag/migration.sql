-- CreateEnum
CREATE TYPE "underwriting_status" AS ENUM ('PENDING', 'INFO_REQUIRED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'UNDERWRITING_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'UNDERWRITING_APPROVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'UNDERWRITING_INFO_REQUIRED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'UNDERWRITING_REJECTED';

-- AlterTable: insurance_products
ALTER TABLE "insurance_products" ADD COLUMN IF NOT EXISTS "require_underwriting" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: underwritings
CREATE TABLE IF NOT EXISTS "underwritings" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "underwriting_status" NOT NULL DEFAULT 'PENDING',
    "risk_level" TEXT,
    "risk_score" DOUBLE PRECISION,
    "requested_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "underwriter_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "condition" TEXT,
    "exclusion" TEXT,
    "deductible" DECIMAL(15,2),
    "required_survey" BOOLEAN NOT NULL DEFAULT false,
    "required_documents" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "underwritings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "underwritings_job_id_version_key" ON "underwritings"("job_id", "version");
CREATE INDEX IF NOT EXISTS "underwritings_job_id_idx" ON "underwritings"("job_id");
CREATE INDEX IF NOT EXISTS "underwritings_status_idx" ON "underwritings"("status");
CREATE INDEX IF NOT EXISTS "underwritings_underwriter_id_idx" ON "underwritings"("underwriter_id");

-- AddForeignKey
ALTER TABLE "underwritings" ADD CONSTRAINT "underwritings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "underwritings" ADD CONSTRAINT "underwritings_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "underwritings" ADD CONSTRAINT "underwritings_underwriter_id_fkey" FOREIGN KEY ("underwriter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

