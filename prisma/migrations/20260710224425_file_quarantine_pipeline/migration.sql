-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'QUARANTINE', 'PENDING_SCAN', 'SCANNING', 'CLEAN', 'INFECTED', 'AVAILABLE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanVerdict" AS ENUM ('CLEAN', 'INFECTED', 'ERROR');

-- DropForeignKey
ALTER TABLE "offline_command_receipts" DROP CONSTRAINT "offline_command_receipts_tenant_fkey";

-- AlterTable
ALTER TABLE "offline_command_receipts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rate_limit_buckets" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID,
    "proof_id" UUID,
    "uploaded_by_id" UUID,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'QUARANTINE',
    "bucket" TEXT NOT NULL,
    "quarantine_key" TEXT NOT NULL,
    "object_key" TEXT,
    "scan_verdict" "ScanVerdict",
    "scan_detail" TEXT,
    "scanned_at" TIMESTAMP(3),
    "promoted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_scan_events" (
    "id" UUID NOT NULL,
    "file_attachment_id" UUID NOT NULL,
    "verdict" "ScanVerdict" NOT NULL,
    "detail" TEXT,
    "engine_version" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "file_attachment_id" UUID,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_attachments_tenant_id_trip_id_idx" ON "file_attachments"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "file_attachments_tenant_id_status_idx" ON "file_attachments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "file_scan_events_file_attachment_id_created_at_idx" ON "file_scan_events"("file_attachment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_receipts_tenant_id_user_id_idempotency_key_key" ON "attachment_receipts"("tenant_id", "user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "offline_command_receipts" ADD CONSTRAINT "offline_command_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_proof_id_fkey" FOREIGN KEY ("proof_id") REFERENCES "proofs_of_delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_scan_events" ADD CONSTRAINT "file_scan_events_file_attachment_id_fkey" FOREIGN KEY ("file_attachment_id") REFERENCES "file_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "offline_command_receipts_expires_idx" RENAME TO "offline_command_receipts_expires_at_idx";

-- RenameIndex
ALTER INDEX "offline_command_receipts_scope_idx" RENAME TO "offline_command_receipts_tenant_id_driver_id_processed_at_idx";

-- RenameIndex
ALTER INDEX "offline_command_receipts_tenant_user_key" RENAME TO "offline_command_receipts_tenant_id_user_id_idempotency_key_key";

-- RenameIndex
ALTER INDEX "password_reset_tokens_user_created_idx" RENAME TO "password_reset_tokens_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "rate_limit_buckets_scope_key" RENAME TO "rate_limit_buckets_scope_key_key";

-- RenameIndex
ALTER INDEX "rate_limit_buckets_window_idx" RENAME TO "rate_limit_buckets_window_end_idx";
