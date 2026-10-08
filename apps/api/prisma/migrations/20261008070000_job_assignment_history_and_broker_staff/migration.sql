-- CreateEnum
CREATE TYPE "assignment_role" AS ENUM ('AGENT', 'BROKER_STAFF', 'MANAGER');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "broker_staff_id" UUID;

-- CreateTable
CREATE TABLE "job_assignment_histories" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "role" "assignment_role" NOT NULL,
    "from_user_id" UUID,
    "to_user_id" UUID,
    "reason" TEXT,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_assignment_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_broker_staff_id_idx" ON "jobs"("broker_staff_id");

-- CreateIndex
CREATE INDEX "job_assignment_histories_job_id_idx" ON "job_assignment_histories"("job_id");

-- CreateIndex
CREATE INDEX "job_assignment_histories_role_idx" ON "job_assignment_histories"("role");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_broker_staff_id_fkey" FOREIGN KEY ("broker_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignment_histories" ADD CONSTRAINT "job_assignment_histories_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignment_histories" ADD CONSTRAINT "job_assignment_histories_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignment_histories" ADD CONSTRAINT "job_assignment_histories_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignment_histories" ADD CONSTRAINT "job_assignment_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

