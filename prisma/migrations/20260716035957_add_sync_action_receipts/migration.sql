-- CreateTable
CREATE TABLE "sync_action_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "OfflineCommandStatus" NOT NULL,
    "result_entity_id" TEXT,
    "error_code" TEXT,
    "client_queued_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_action_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_action_receipts_tenant_id_user_id_processed_at_idx" ON "sync_action_receipts"("tenant_id", "user_id", "processed_at");

-- CreateIndex
CREATE INDEX "sync_action_receipts_expires_at_idx" ON "sync_action_receipts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_action_receipts_tenant_id_user_id_idempotency_key_key" ON "sync_action_receipts"("tenant_id", "user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "sync_action_receipts" ADD CONSTRAINT "sync_action_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
