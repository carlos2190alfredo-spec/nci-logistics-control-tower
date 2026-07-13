-- CreateEnum
CREATE TYPE "IntegrationConnectorType" AS ENUM ('GPS', 'WHATSAPP', 'CRM', 'BILLING', 'WEBHOOKS', 'EMAIL', 'AI');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISABLED', 'ENABLED', 'ERROR', 'CONFIGURING');

-- CreateEnum
CREATE TYPE "AiRecommendationType" AS ENUM ('OPTIMIZATION', 'ALERT', 'INSIGHT', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "AiRecommendationStatus" AS ENUM ('PENDING', 'VIEWED', 'ACTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AiRecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'UX', 'PERFORMANCE', 'INTEGRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "integration_connectors" (
    "id" UUID NOT NULL,
    "type" "IntegrationConnectorType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "config_schema" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "connector_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISABLED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL,
    "tenant_integration_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL,
    "tenant_integration_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_webhook_endpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_endpoint_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "http_status" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rule_id" TEXT NOT NULL,
    "type" "AiRecommendationType" NOT NULL,
    "priority" "AiRecommendationPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "AiRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "action_required" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "acted_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insight_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "rules_run" INTEGER NOT NULL DEFAULT 0,
    "matches_found" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insight_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'SUBMITTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "response" TEXT,
    "responded_by_id" UUID,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_connectors_type_name_key" ON "integration_connectors"("type", "name");

-- CreateIndex
CREATE INDEX "tenant_integrations_tenant_id_idx" ON "tenant_integrations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_tenant_id_connector_id_key" ON "tenant_integrations"("tenant_id", "connector_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_tenant_integration_id_key_key" ON "integration_credentials"("tenant_integration_id", "key");

-- CreateIndex
CREATE INDEX "integration_events_tenant_integration_id_created_at_idx" ON "integration_events"("tenant_integration_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_webhook_endpoints_tenant_id_active_idx" ON "tenant_webhook_endpoints"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_endpoint_id_created_at_idx" ON "webhook_deliveries"("webhook_endpoint_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_settings_tenant_id_key" ON "tenant_ai_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_recommendations_tenant_id_status_idx" ON "ai_recommendations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ai_recommendations_tenant_id_type_created_at_idx" ON "ai_recommendations"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "ai_insight_events_tenant_id_processed_at_idx" ON "ai_insight_events"("tenant_id", "processed_at");

-- CreateIndex
CREATE INDEX "tenant_feedback_tenant_id_status_idx" ON "tenant_feedback"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_feedback_tenant_id_type_idx" ON "tenant_feedback"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_tenant_id_expires_at_idx" ON "user_invitations"("tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_tenant_id_email_key" ON "user_invitations"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "tenant_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "tenant_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_webhook_endpoints" ADD CONSTRAINT "tenant_webhook_endpoints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "tenant_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ai_settings" ADD CONSTRAINT "tenant_ai_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insight_events" ADD CONSTRAINT "ai_insight_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feedback" ADD CONSTRAINT "tenant_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feedback" ADD CONSTRAINT "tenant_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
