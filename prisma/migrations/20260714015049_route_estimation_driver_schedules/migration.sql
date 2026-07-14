-- CreateEnum
CREATE TYPE "TripStopType" AS ENUM ('START', 'PICKUP', 'DELIVERY', 'RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "RouteProvider" AS ENUM ('DISABLED', 'SIMULATED', 'GOOGLE_ROUTES', 'WAZE_FUTURE');

-- CreateEnum
CREATE TYPE "RouteEstimateStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'ESTIMATED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('DAY_OFF', 'VACATION', 'SICK_LEAVE', 'EXTRA_SHIFT', 'CUSTOM_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('GENERATED', 'ACCEPTED', 'DISMISSED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationGeneratedBy" AS ENUM ('RULES_ENGINE', 'AI_DISABLED_PROVIDER', 'AI_PROVIDER_FUTURE');

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "type" "TripStopType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT,
    "address_text" TEXT NOT NULL,
    "place_id" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "planned_arrival_at" TIMESTAMP(3),
    "planned_departure_at" TIMESTAMP(3),
    "time_window_start" TIMESTAMP(3),
    "time_window_end" TIMESTAMP(3),
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_route_estimates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" "RouteProvider" NOT NULL,
    "status" "RouteEstimateStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "distance_meters" INTEGER,
    "duration_seconds" INTEGER,
    "traffic_duration_seconds" INTEGER,
    "static_duration_seconds" INTEGER,
    "estimated_start_at" TIMESTAMP(3),
    "estimated_end_at" TIMESTAMP(3),
    "calculated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "route_summary" TEXT,
    "polyline_encoded" TEXT,
    "provider_request_hash" TEXT,
    "safe_provider_summary_json" JSONB,
    "error_code" TEXT,
    "safe_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_route_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stop_estimates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "estimated_arrival_at" TIMESTAMP(3),
    "estimated_departure_at" TIMESTAMP(3),
    "leg_distance_meters" INTEGER,
    "leg_duration_seconds" INTEGER,
    "leg_traffic_duration_seconds" INTEGER,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_stop_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_work_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_time_local" TEXT NOT NULL,
    "end_time_local" TEXT NOT NULL,
    "break_start_local" TEXT,
    "break_end_local" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Panama',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_availability_exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "start_time_local" TEXT,
    "end_time_local" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_assignment_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "driver_id" UUID,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'GENERATED',
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "recommendation_title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "reasons_json" JSONB NOT NULL DEFAULT '[]',
    "warnings_json" JSONB NOT NULL DEFAULT '[]',
    "generated_by" "RecommendationGeneratedBy" NOT NULL,
    "override_reason" TEXT,
    "accepted_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_assignment_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_trip_id_sequence_idx" ON "trip_stops"("tenant_id", "trip_id", "sequence");

-- CreateIndex
CREATE INDEX "trip_route_estimates_tenant_id_trip_id_idx" ON "trip_route_estimates"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_route_estimates_provider_request_hash_idx" ON "trip_route_estimates"("provider_request_hash");

-- CreateIndex
CREATE INDEX "trip_stop_estimates_tenant_id_trip_id_idx" ON "trip_stop_estimates"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "driver_work_schedules_tenant_id_driver_id_idx" ON "driver_work_schedules"("tenant_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_work_schedules_tenant_id_driver_id_day_of_week_key" ON "driver_work_schedules"("tenant_id", "driver_id", "day_of_week");

-- CreateIndex
CREATE INDEX "driver_availability_exceptions_tenant_id_driver_id_date_idx" ON "driver_availability_exceptions"("tenant_id", "driver_id", "date");

-- CreateIndex
CREATE INDEX "driver_assignment_recommendations_tenant_id_trip_id_idx" ON "driver_assignment_recommendations"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "driver_assignment_recommendations_tenant_id_driver_id_idx" ON "driver_assignment_recommendations"("tenant_id", "driver_id");

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_route_estimates" ADD CONSTRAINT "trip_route_estimates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_route_estimates" ADD CONSTRAINT "trip_route_estimates_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stop_estimates" ADD CONSTRAINT "trip_stop_estimates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stop_estimates" ADD CONSTRAINT "trip_stop_estimates_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stop_estimates" ADD CONSTRAINT "trip_stop_estimates_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "trip_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_work_schedules" ADD CONSTRAINT "driver_work_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_work_schedules" ADD CONSTRAINT "driver_work_schedules_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability_exceptions" ADD CONSTRAINT "driver_availability_exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability_exceptions" ADD CONSTRAINT "driver_availability_exceptions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignment_recommendations" ADD CONSTRAINT "driver_assignment_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignment_recommendations" ADD CONSTRAINT "driver_assignment_recommendations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignment_recommendations" ADD CONSTRAINT "driver_assignment_recommendations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
