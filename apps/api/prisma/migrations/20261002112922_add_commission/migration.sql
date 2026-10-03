-- CreateEnum
CREATE TYPE "commission_type" AS ENUM ('COMPANY', 'AGENT', 'TEAM', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "commission_status" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "agent_id" UUID,
    "commission_type" "commission_type" NOT NULL,
    "commission_rate" DECIMAL(10,4) NOT NULL,
    "commission_base" DECIMAL(15,2) NOT NULL,
    "commission_amount" DECIMAL(15,2) NOT NULL,
    "status" "commission_status" NOT NULL DEFAULT 'CALCULATED',
    "paid_date" DATE,
    "remark" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commissions_policy_id_idx" ON "commissions"("policy_id");

-- CreateIndex
CREATE INDEX "commissions_agent_id_idx" ON "commissions"("agent_id");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
