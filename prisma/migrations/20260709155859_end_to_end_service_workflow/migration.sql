-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "proofs_of_delivery" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "ProofStatus" NOT NULL DEFAULT 'SUBMITTED';

-- CreateTable
CREATE TABLE "trip_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_assignments_tenant_id_trip_id_idx" ON "trip_assignments"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_assignments_tenant_id_driver_id_scheduled_at_idx" ON "trip_assignments"("tenant_id", "driver_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "trip_assignments_tenant_id_vehicle_id_scheduled_at_idx" ON "trip_assignments"("tenant_id", "vehicle_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "trip_assignments_tenant_id_equipment_id_scheduled_at_idx" ON "trip_assignments"("tenant_id", "equipment_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
