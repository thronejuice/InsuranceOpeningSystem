-- CreateEnum
CREATE TYPE "policy_status" AS ENUM ('PENDING', 'ISSUED', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'RENEWED');

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "bindings" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "binding_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "expiry_date" DATE,
    "confirmed_by_id" UUID,
    "remark" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "policy_no" TEXT NOT NULL,
    "job_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "insurance_company_id" UUID NOT NULL,
    "policy_type" TEXT,
    "effective_date" DATE NOT NULL,
    "expiry_date" DATE,
    "sum_insured" DECIMAL(15,2),
    "gross_premium" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_premium" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stamp_duty" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_premium" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "policy_status" NOT NULL DEFAULT 'PENDING',
    "payment_due_date" DATE,
    "issued_at" TIMESTAMPTZ(3),
    "remark" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_coverages" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "coverage_id" UUID,
    "coverage_name" TEXT NOT NULL,
    "sum_insured" DECIMAL(15,2) NOT NULL,
    "rate" DECIMAL(10,6),
    "deductible" DECIMAL(15,2),
    "premium" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_entity_type_entity_id_idx" ON "idempotency_keys"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "bindings_job_id_key" ON "bindings"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "bindings_idempotency_key_key" ON "bindings"("idempotency_key");

-- CreateIndex
CREATE INDEX "bindings_quotation_id_idx" ON "bindings"("quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_policy_no_key" ON "policies"("policy_no");

-- CreateIndex
CREATE UNIQUE INDEX "policies_job_id_key" ON "policies"("job_id");

-- CreateIndex
CREATE INDEX "policies_status_idx" ON "policies"("status");

-- CreateIndex
CREATE INDEX "policy_coverages_policy_id_idx" ON "policy_coverages"("policy_id");

-- AddForeignKey
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_insurance_company_id_fkey" FOREIGN KEY ("insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_coverages" ADD CONSTRAINT "policy_coverages_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
