-- Migration: 20261010090000_insurer_products
-- Day 42 — insurer contacts, bank account, products an insurer accepts; one live primary contact per insurer

-- These two shipped in the schema without a migration (databases were synced with `db push`); IF NOT EXISTS keeps
-- already-synced databases working while a fresh `migrate deploy` / `db:reset` now builds them too.
ALTER TABLE "insurance_companies" ADD COLUMN IF NOT EXISTS "bank_account" TEXT;

CREATE TABLE IF NOT EXISTS "insurer_contacts" (
  "id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
  "insurance_company_id" UUID           NOT NULL,
  "name"                 TEXT           NOT NULL,
  "position"             TEXT,
  "email"                TEXT,
  "phone"                TEXT,
  "is_underwriter"       BOOLEAN        NOT NULL DEFAULT false,
  "is_primary"           BOOLEAN        NOT NULL DEFAULT false,
  "active"               BOOLEAN        NOT NULL DEFAULT true,
  "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ(3) NOT NULL,
  "deleted_at"           TIMESTAMPTZ(3),
  CONSTRAINT "insurer_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "insurer_contacts_insurance_company_id_fkey" FOREIGN KEY ("insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);


CREATE TABLE IF NOT EXISTS "insurer_products" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "insurance_company_id" UUID         NOT NULL,
  "product_id"           UUID         NOT NULL,
  "remark"               TEXT,
  "created_by_id"        UUID,
  "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ(3) NOT NULL,
  "deleted_at"           TIMESTAMPTZ(3),
  CONSTRAINT "insurer_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "insurer_products_insurance_company_id_fkey" FOREIGN KEY ("insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "insurer_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "insurer_products_insurance_company_id_idx" ON "insurer_products"("insurance_company_id");
CREATE INDEX IF NOT EXISTS "insurer_products_product_id_idx" ON "insurer_products"("product_id");

-- One live row per insurer × product (soft-deleted rows may repeat)
CREATE UNIQUE INDEX IF NOT EXISTS "insurer_products_live_key"
  ON "insurer_products" ("insurance_company_id", "product_id") WHERE "deleted_at" IS NULL;

-- Backfill: every product that already has a commission rate or quotation with the insurer is accepted
INSERT INTO "insurer_products" ("insurance_company_id", "product_id", "updated_at")
SELECT DISTINCT cr."insurance_company_id", cr."product_id", CURRENT_TIMESTAMP
FROM "commission_rates" cr
WHERE cr."deleted_at" IS NULL
ON CONFLICT DO NOTHING;

-- At most one live primary contact per insurer (was only enforced in application code)
UPDATE "insurer_contacts" c SET "is_primary" = false
WHERE c."is_primary" AND c."deleted_at" IS NULL AND c."id" <> (
  SELECT c2."id" FROM "insurer_contacts" c2
  WHERE c2."insurance_company_id" = c."insurance_company_id" AND c2."is_primary" AND c2."deleted_at" IS NULL
  ORDER BY c2."created_at", c2."id" LIMIT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "insurer_contacts_primary_key"
  ON "insurer_contacts" ("insurance_company_id") WHERE "is_primary" AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "insurer_contacts_insurance_company_id_idx" ON "insurer_contacts"("insurance_company_id");
CREATE INDEX IF NOT EXISTS "insurer_contacts_is_underwriter_idx" ON "insurer_contacts"("is_underwriter");
