-- CreateEnum
CREATE TYPE "renewal_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'QUOTATION', 'CUSTOMER_CONTACTED', 'ACCEPTED', 'REJECTED', 'RENEWED', 'LOST', 'CANCELLED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "previous_policy_id" UUID;

-- CreateTable
CREATE TABLE "renewals" (
    "id" UUID NOT NULL,
    "previous_policy_id" UUID NOT NULL,
    "new_job_id" UUID,
    "renewal_date" DATE NOT NULL,
    "target_expiry_date" DATE NOT NULL,
    "status" "renewal_status" NOT NULL DEFAULT 'PENDING',
    "assigned_to" UUID,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renewals_new_job_id_key" ON "renewals"("new_job_id");

-- CreateIndex
CREATE INDEX "renewals_previous_policy_id_idx" ON "renewals"("previous_policy_id");

-- CreateIndex
CREATE INDEX "renewals_status_idx" ON "renewals"("status");

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_previous_policy_id_fkey" FOREIGN KEY ("previous_policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_new_job_id_fkey" FOREIGN KEY ("new_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
