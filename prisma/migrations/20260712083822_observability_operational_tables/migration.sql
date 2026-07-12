-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('P0', 'P1', 'P2');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "operational_checks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_alerts" (
    "id" UUID NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "dedupe_key" TEXT NOT NULL,
    "tenant_id" UUID,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "triggered_by" TEXT,
    "request_id" TEXT,
    "summary_json" JSONB,
    "error_code" TEXT,
    "safe_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics_snapshots" (
    "id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "metrics_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operational_checks_name_checked_at_idx" ON "operational_checks"("name", "checked_at");

-- CreateIndex
CREATE INDEX "operational_alerts_status_severity_idx" ON "operational_alerts"("status", "severity");

-- CreateIndex
CREATE INDEX "operational_alerts_source_status_idx" ON "operational_alerts"("source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "operational_alerts_dedupe_key_key" ON "operational_alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_status_idx" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "system_metrics_snapshots_captured_at_idx" ON "system_metrics_snapshots"("captured_at");
