-- Offline command receipts and rate limit buckets
CREATE TYPE "OfflineCommandStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'CONFLICT', 'REJECTED', 'FAILED');

CREATE TABLE "offline_command_receipts" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          UUID NOT NULL,
  "user_id"            UUID NOT NULL,
  "driver_id"          UUID,
  "trip_id"            UUID,
  "idempotency_key"    TEXT NOT NULL,
  "action_type"        TEXT NOT NULL,
  "payload_hash"       TEXT NOT NULL,
  "status"             "OfflineCommandStatus" NOT NULL,
  "result_entity_id"   TEXT,
  "error_code"         TEXT,
  "client_queued_at"   TIMESTAMP(3),
  "processed_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offline_command_receipts_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "offline_command_receipts_tenant_user_key"
  ON "offline_command_receipts" ("tenant_id", "user_id", "idempotency_key");

CREATE INDEX "offline_command_receipts_scope_idx"
  ON "offline_command_receipts" ("tenant_id", "driver_id", "processed_at");

CREATE INDEX "offline_command_receipts_expires_idx"
  ON "offline_command_receipts" ("expires_at");

CREATE TABLE "rate_limit_buckets" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope"       TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 0,
  "window_end"  TIMESTAMP(3) NOT NULL,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "rate_limit_buckets_scope_key" ON "rate_limit_buckets" ("scope", "key");
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" ("window_end");
