-- CreateTable
CREATE TABLE "job_risks" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_risk_values" (
    "id" UUID NOT NULL,
    "job_risk_id" UUID NOT NULL,
    "field_code" TEXT NOT NULL,
    "field_value" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_risk_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_coverages" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "coverage_id" UUID NOT NULL,
    "sum_insured" DECIMAL(15,2),
    "deductible" DECIMAL(15,2),
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_risks_job_id_key" ON "job_risks"("job_id");

-- CreateIndex
CREATE INDEX "job_risk_values_job_risk_id_idx" ON "job_risk_values"("job_risk_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_risk_values_job_risk_id_field_code_key" ON "job_risk_values"("job_risk_id", "field_code");

-- CreateIndex
CREATE INDEX "job_coverages_job_id_idx" ON "job_coverages"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_coverages_job_id_coverage_id_key" ON "job_coverages"("job_id", "coverage_id");

-- AddForeignKey
ALTER TABLE "job_risks" ADD CONSTRAINT "job_risks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_risk_values" ADD CONSTRAINT "job_risk_values_job_risk_id_fkey" FOREIGN KEY ("job_risk_id") REFERENCES "job_risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_coverages" ADD CONSTRAINT "job_coverages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_coverages" ADD CONSTRAINT "job_coverages_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "insurance_coverages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
