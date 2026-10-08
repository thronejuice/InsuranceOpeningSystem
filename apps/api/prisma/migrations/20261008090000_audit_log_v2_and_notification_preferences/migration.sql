-- CreateEnum
CREATE TYPE "activity_source" AS ENUM ('WEB', 'API', 'JOB', 'IMPORT');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUESTED';

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN "source" "activity_source" NOT NULL DEFAULT 'WEB',
ADD COLUMN "remark" TEXT;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

