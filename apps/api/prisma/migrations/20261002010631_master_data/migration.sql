-- CreateEnum
CREATE TYPE "company_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "risk_field_type" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'FILE', 'JSON');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('ID_CARD', 'COMPANY_REGISTRATION', 'TAX_DOCUMENT', 'VEHICLE_BOOK', 'PREVIOUS_POLICY', 'VEHICLE_PHOTO', 'RISK_SURVEY', 'QUOTATION', 'PROPOSAL', 'POLICY', 'INVOICE', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "approval_condition_field" AS ENUM ('PREMIUM', 'DISCOUNT', 'SUM_INSURED');

-- CreateEnum
CREATE TYPE "approval_condition_operator" AS ENUM ('LT', 'LTE', 'GT', 'GTE', 'EQ');

-- CreateEnum
CREATE TYPE "approval_role_target" AS ENUM ('SUPERVISOR', 'MANAGER', 'ADMIN');

-- CreateTable
CREATE TABLE "insurance_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_products" (
    "id" UUID NOT NULL,
    "insurance_type_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "require_docs_on_submit" BOOLEAN NOT NULL DEFAULT false,
    "require_docs_on_bind" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_companies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "status" "company_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "insurance_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_coverages" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_sum_insured" DECIMAL(15,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_field_definitions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "field_code" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_type" "risk_field_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "validation_rule" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "risk_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_checklists" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "document_type" "document_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "condition_field" "approval_condition_field" NOT NULL,
    "condition_operator" "approval_condition_operator" NOT NULL,
    "threshold_value" DECIMAL(15,2) NOT NULL,
    "approver_role" "approval_role_target" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_types_code_key" ON "insurance_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_products_code_key" ON "insurance_products"("code");

-- CreateIndex
CREATE INDEX "insurance_products_insurance_type_id_idx" ON "insurance_products"("insurance_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_companies_code_key" ON "insurance_companies"("code");

-- CreateIndex
CREATE INDEX "insurance_companies_status_idx" ON "insurance_companies"("status");

-- CreateIndex
CREATE INDEX "insurance_coverages_product_id_idx" ON "insurance_coverages"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_coverages_product_id_code_key" ON "insurance_coverages"("product_id", "code");

-- CreateIndex
CREATE INDEX "risk_field_definitions_product_id_sort_order_idx" ON "risk_field_definitions"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "risk_field_definitions_product_id_field_code_key" ON "risk_field_definitions"("product_id", "field_code");

-- CreateIndex
CREATE INDEX "document_checklists_product_id_idx" ON "document_checklists"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_checklists_product_id_document_type_key" ON "document_checklists"("product_id", "document_type");

-- AddForeignKey
ALTER TABLE "insurance_products" ADD CONSTRAINT "insurance_products_insurance_type_id_fkey" FOREIGN KEY ("insurance_type_id") REFERENCES "insurance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_coverages" ADD CONSTRAINT "insurance_coverages_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_field_definitions" ADD CONSTRAINT "risk_field_definitions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_checklists" ADD CONSTRAINT "document_checklists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
