-- CreateEnum
CREATE TYPE "quotation_version_status" AS ENUM ('ACTIVE', 'SUPERSEDED', 'SELECTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- AlterEnum
ALTER TYPE "quotation_status" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

-- AlterTable: quotations
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);

-- CreateTable: commission_rates
CREATE TABLE IF NOT EXISTS "commission_rates" (
    "id" UUID NOT NULL,
    "insurance_company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: quotation_versions
CREATE TABLE IF NOT EXISTS "quotation_versions" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "quotation_version_status" NOT NULL DEFAULT 'ACTIVE',
    "quotation_date" DATE,
    "valid_until" DATE,
    "gross_premium" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_premium" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stamp_duty" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(10,4),
    "commission_amount" DECIMAL(15,2),
    "deductible" DECIMAL(15,2),
    "exclusion" TEXT,
    "special_condition" TEXT,
    "insurer_reference" TEXT,
    "underwriter" TEXT,
    "attachment" TEXT,
    "remark" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: quotation_items
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "quotation_version_id" UUID;

-- AlterTable: proposals
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "quotation_version_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "commission_rates_insurance_company_id_idx" ON "commission_rates"("insurance_company_id");
CREATE INDEX IF NOT EXISTS "commission_rates_product_id_idx" ON "commission_rates"("product_id");
CREATE INDEX IF NOT EXISTS "commission_rates_effective_from_effective_to_idx" ON "commission_rates"("effective_from", "effective_to");

CREATE UNIQUE INDEX IF NOT EXISTS "quotation_versions_quotation_id_version_key" ON "quotation_versions"("quotation_id", "version");
CREATE INDEX IF NOT EXISTS "quotation_versions_quotation_id_idx" ON "quotation_versions"("quotation_id");
CREATE INDEX IF NOT EXISTS "quotation_versions_status_idx" ON "quotation_versions"("status");
CREATE INDEX IF NOT EXISTS "quotation_versions_valid_until_idx" ON "quotation_versions"("valid_until");

CREATE INDEX IF NOT EXISTS "quotation_items_quotation_version_id_idx" ON "quotation_items"("quotation_version_id");

-- AddForeignKey
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_insurance_company_id_fkey" FOREIGN KEY ("insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_version_id_fkey" FOREIGN KEY ("quotation_version_id") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_quotation_version_id_fkey" FOREIGN KEY ("quotation_version_id") REFERENCES "quotation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing quotations into quotation_versions if any
INSERT INTO "quotation_versions" (
    "id", "quotation_id", "version", "status", "quotation_date", "valid_until",
    "gross_premium", "discount", "net_premium", "tax", "stamp_duty", "total_amount",
    "remark", "created_by_id", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(), q."id", q."version", 'ACTIVE'::"quotation_version_status", q."quotation_date", q."valid_until",
    q."gross_premium", q."discount", q."net_premium", q."tax", q."stamp_duty", q."total_amount",
    q."remark", q."requested_by_id", q."created_at", q."updated_at"
FROM "quotations" q
WHERE NOT EXISTS (
    SELECT 1 FROM "quotation_versions" qv WHERE qv."quotation_id" = q."id" AND qv."version" = q."version"
);

-- Backfill quotation_items quotation_version_id
UPDATE "quotation_items" qi
SET "quotation_version_id" = qv."id"
FROM "quotation_versions" qv
WHERE qi."quotation_id" = qv."quotation_id" AND qi."quotation_version_id" IS NULL;

