-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'CUSTOMER_REJECTED';

-- CreateEnum: acceptance_method
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acceptance_method') THEN
        CREATE TYPE "acceptance_method" AS ENUM ('EMAIL', 'SIGNED_DOCUMENT', 'LINE', 'MANUAL');
    END IF;
END $$;

-- CreateTable: proposal_acceptances
CREATE TABLE IF NOT EXISTS "proposal_acceptances" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "proposal_version" INTEGER NOT NULL,
    "accepted_by_name" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "acceptance_method" NOT NULL,
    "ip_address" TEXT,
    "evidence_file_id" UUID,
    "remark" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "proposal_acceptances_proposal_id_idx" ON "proposal_acceptances"("proposal_id");
CREATE INDEX IF NOT EXISTS "proposal_acceptances_evidence_file_id_idx" ON "proposal_acceptances"("evidence_file_id");
CREATE INDEX IF NOT EXISTS "proposal_acceptances_recorded_by_id_idx" ON "proposal_acceptances"("recorded_by_id");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposal_acceptances_proposal_id_fkey'
    ) THEN
        ALTER TABLE "proposal_acceptances" ADD CONSTRAINT "proposal_acceptances_proposal_id_fkey"
            FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposal_acceptances_evidence_file_id_fkey'
    ) THEN
        ALTER TABLE "proposal_acceptances" ADD CONSTRAINT "proposal_acceptances_evidence_file_id_fkey"
            FOREIGN KEY ("evidence_file_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'proposal_acceptances_recorded_by_id_fkey'
    ) THEN
        ALTER TABLE "proposal_acceptances" ADD CONSTRAINT "proposal_acceptances_recorded_by_id_fkey"
            FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

