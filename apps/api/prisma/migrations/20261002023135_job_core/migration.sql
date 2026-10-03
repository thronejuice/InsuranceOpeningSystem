-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('DRAFT', 'OPEN', 'WAITING_INFORMATION', 'QUOTATION_REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED', 'PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'CANCELLED', 'CLOSED', 'EXPIRED', 'RENEWAL');

-- CreateEnum
CREATE TYPE "job_priority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "job_no" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "insurance_type_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "assigned_to" UUID,
    "source" TEXT,
    "priority" "job_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "job_status" NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE NOT NULL,
    "expiry_date" DATE,
    "remark" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "selected_quotation_id" UUID,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_histories" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_status" "job_status" NOT NULL,
    "to_status" "job_status" NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_job_no_key" ON "jobs"("job_no");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_selected_quotation_id_key" ON "jobs"("selected_quotation_id");

-- CreateIndex
CREATE INDEX "jobs_customer_id_idx" ON "jobs"("customer_id");

-- CreateIndex
CREATE INDEX "jobs_agent_id_idx" ON "jobs"("agent_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_product_id_idx" ON "jobs"("product_id");

-- CreateIndex
CREATE INDEX "jobs_effective_date_idx" ON "jobs"("effective_date");

-- CreateIndex
CREATE INDEX "jobs_deleted_at_idx" ON "jobs"("deleted_at");

-- CreateIndex
CREATE INDEX "job_status_histories_job_id_idx" ON "job_status_histories"("job_id");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_insurance_type_id_fkey" FOREIGN KEY ("insurance_type_id") REFERENCES "insurance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_histories" ADD CONSTRAINT "job_status_histories_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_histories" ADD CONSTRAINT "job_status_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
