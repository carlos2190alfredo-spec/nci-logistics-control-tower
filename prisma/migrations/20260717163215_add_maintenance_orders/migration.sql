-- CreateEnum
CREATE TYPE "MaintenanceAssetType" AS ENUM ('VEHICULO', 'EQUIPO');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVO', 'CORRECTIVO', 'INSPECCION');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PROGRAMADO', 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_type" "MaintenanceAssetType" NOT NULL,
    "asset_code" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PROGRAMADO',
    "blocks_asset" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "provider" TEXT,
    "cost" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "odometer_km" INTEGER,
    "next_service_km" INTEGER,
    "next_service_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_orders_tenant_id_asset_type_asset_code_idx" ON "maintenance_orders"("tenant_id", "asset_type", "asset_code");

-- CreateIndex
CREATE INDEX "maintenance_orders_tenant_id_status_idx" ON "maintenance_orders"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
