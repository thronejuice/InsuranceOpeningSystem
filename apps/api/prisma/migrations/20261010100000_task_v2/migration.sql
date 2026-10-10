-- Migration: 20261010100000_task_v2
-- Phase 6 — Task V2 (tasks may hang off a customer or policy instead of a job) and the TASK_OVERDUE notification.
-- Written with IF NOT EXISTS because the schema reached development databases through `db push` first.

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';
ALTER TYPE "task_type" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_INSURER';
ALTER TYPE "task_type" ADD VALUE IF NOT EXISTS 'RENEWAL_FOLLOW_UP';
ALTER TYPE "task_type" ADD VALUE IF NOT EXISTS 'CLAIM_FOLLOW_UP';

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "customer_id" UUID;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "policy_id" UUID;
ALTER TABLE "tasks" ALTER COLUMN "job_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "tasks_customer_id_idx" ON "tasks"("customer_id");
CREATE INDEX IF NOT EXISTS "tasks_policy_id_idx" ON "tasks"("policy_id");

ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_job_id_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_customer_id_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_policy_id_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
