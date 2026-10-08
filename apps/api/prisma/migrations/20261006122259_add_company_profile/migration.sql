-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "address_th" TEXT,
    "address_en" TEXT,
    "tax_id" TEXT,
    "broker_license_no" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_path" TEXT,
    "logo_mime_type" TEXT,
    "proposal_terms" TEXT,
    "bank_accounts" JSONB NOT NULL DEFAULT '[]',
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);
