-- Session metadata for active session management and password reset revocation
ALTER TABLE "sessions"
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "ip_hash" TEXT,
  ADD COLUMN "last_seen_at" TIMESTAMP(3);

ALTER TABLE "password_reset_tokens"
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "requested_ip_hash" TEXT;

CREATE INDEX "password_reset_tokens_user_created_idx"
  ON "password_reset_tokens" ("user_id", "created_at");
