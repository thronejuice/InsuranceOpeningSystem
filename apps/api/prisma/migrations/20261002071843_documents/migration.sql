-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('ACTIVE', 'DELETED');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "document_type" "document_type" NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "document_status" NOT NULL DEFAULT 'ACTIVE',
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_job_id_status_idx" ON "documents"("job_id", "status");

-- CreateIndex
CREATE INDEX "documents_job_id_document_type_idx" ON "documents"("job_id", "document_type");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
