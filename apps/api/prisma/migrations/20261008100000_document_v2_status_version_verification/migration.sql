-- AlterEnum: Recreate document_status enum with V2 values
ALTER TYPE "document_status" RENAME TO "document_status_old";
CREATE TYPE "document_status" AS ENUM ('REQUIRED', 'UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "status" TYPE "document_status" USING (
  CASE
    WHEN "status"::text = 'ACTIVE' THEN 'UPLOADED'::"document_status"
    WHEN "status"::text = 'DELETED' THEN 'REJECTED'::"document_status"
    ELSE 'UPLOADED'::"document_status"
  END
);
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'UPLOADED'::"document_status";
DROP TYPE "document_status_old";

-- Add columns
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "verified_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "expiry_date" DATE,
  ADD COLUMN IF NOT EXISTS "remark" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documents_expiry_date_idx" ON "documents"("expiry_date");

