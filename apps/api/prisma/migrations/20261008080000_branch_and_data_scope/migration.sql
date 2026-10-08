-- CreateEnum
CREATE TYPE "data_scope" AS ENUM ('OWN', 'ASSIGNED', 'TEAM', 'BRANCH', 'ALL');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN "data_scope" "data_scope" NOT NULL DEFAULT 'OWN';

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- AlterTable
ALTER TABLE "users" ADD COLUMN "branch_id" UUID;
ALTER TABLE "users" ADD COLUMN "manager_id" UUID;

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");
CREATE INDEX "users_manager_id_idx" ON "users"("manager_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "branch_id" UUID;

-- CreateIndex
CREATE INDEX "jobs_branch_id_idx" ON "jobs"("branch_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

