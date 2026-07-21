-- AlterTable
ALTER TABLE "tenant_support_sessions" ADD COLUMN     "close_notes" TEXT,
ADD COLUMN     "ended_by_id" UUID,
ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tenant_support_sessions_tenant_id_ended_at_idx" ON "tenant_support_sessions"("tenant_id", "ended_at");
