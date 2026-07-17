-- CreateEnum
CREATE TYPE "ContainerOperationType" AS ENUM ('IMPORTACION', 'EXPORTACION', 'TRANSITO', 'REEXPORTACION', 'MOVIMIENTO_NACIONAL');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('SECO', 'REFRIGERADO', 'OPEN_TOP', 'FLAT_RACK', 'TANQUE', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "ContainerSize" AS ENUM ('S20', 'S40', 'S45', 'OTRO');

-- CreateEnum
CREATE TYPE "ContainerFill" AS ENUM ('LLENO', 'VACIO');

-- CreateEnum
CREATE TYPE "ContainerReleaseStatus" AS ENUM ('PENDIENTE', 'LIBERADO', 'RECHAZADO', 'RETENIDO');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('SOLICITUD_RECIBIDA', 'VALIDACION_COMERCIAL', 'DOCUMENTOS_PENDIENTES', 'DOCUMENTACION_COMPLETA', 'LIBERACION_PENDIENTE', 'LIBERADO', 'CITA_SOLICITADA', 'CITA_CONFIRMADA', 'UNIDAD_ASIGNADA', 'EN_RUTA_TERMINAL', 'EN_TERMINAL', 'GATE_IN', 'RETIRADO', 'GATE_OUT', 'EN_TRANSITO', 'EN_DESTINO', 'ENTREGA_INICIADA', 'ENTREGA_COMPLETADA', 'POD_GENERADO', 'VACIO_PENDIENTE', 'DEVOLUCION_PROGRAMADA', 'VACIO_DEVUELTO', 'EIR_CONFIRMADO', 'CARGOS_CONCILIADOS', 'EXPEDIENTE_CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ContainerChargeType" AS ENUM ('ALMACENAJE_PORTUARIO', 'DEMURRAGE', 'DETENTION', 'RETENCION', 'ESPERA', 'STANDBY', 'MANIOBRAS', 'SOBRECOSTO', 'REENTREGA', 'REPROGRAMACION', 'TERCEROS');

-- CreateEnum
CREATE TYPE "ContainerChargeStatus" AS ENUM ('PROYECTADO', 'EN_CURSO', 'CERRADO', 'CONCILIADO', 'DISPUTADO');

-- CreateTable
CREATE TABLE "containers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "operation_type" "ContainerOperationType" NOT NULL,
    "status" "ContainerStatus" NOT NULL DEFAULT 'SOLICITUD_RECIBIDA',
    "fill" "ContainerFill" NOT NULL DEFAULT 'LLENO',
    "container_number" TEXT,
    "iso_code" TEXT,
    "size" "ContainerSize" NOT NULL DEFAULT 'S40',
    "type" "ContainerType" NOT NULL DEFAULT 'SECO',
    "owner_line" TEXT,
    "shipping_line" TEXT,
    "terminal" TEXT,
    "yard" TEXT,
    "booking" TEXT,
    "bill_of_lading" TEXT,
    "seal_number" TEXT,
    "weight_kg" INTEGER,
    "tare_kg" INTEGER,
    "gross_weight_kg" INTEGER,
    "vgm_kg" INTEGER,
    "product" TEXT,
    "temperature_c" DOUBLE PRECISION,
    "customer_account_id" UUID,
    "consignee" TEXT,
    "customs_agent" TEXT,
    "customs_office" TEXT,
    "customs_regime" TEXT,
    "release_status" "ContainerReleaseStatus" NOT NULL DEFAULT 'PENDIENTE',
    "available_at" TIMESTAMP(3),
    "appointment_at" TIMESTAMP(3),
    "origin" TEXT,
    "destination" TEXT,
    "pickup_deadline" TIMESTAMP(3),
    "return_deadline" TIMESTAMP(3),
    "free_days" INTEGER,
    "gate_in_at" TIMESTAMP(3),
    "gate_out_at" TIMESTAMP(3),
    "empty_returned_at" TIMESTAMP(3),
    "eir_confirmed_at" TIMESTAMP(3),
    "trip_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_charges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "type" "ContainerChargeType" NOT NULL,
    "status" "ContainerChargeStatus" NOT NULL DEFAULT 'PROYECTADO',
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "free_days" INTEGER NOT NULL DEFAULT 0,
    "rate_per_day" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "responsible" TEXT,
    "projected_amount" DECIMAL(12,2),
    "actual_amount" DECIMAL(12,2),
    "evidence_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "containers_tenant_id_status_idx" ON "containers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "containers_tenant_id_return_deadline_idx" ON "containers"("tenant_id", "return_deadline");

-- CreateIndex
CREATE INDEX "containers_tenant_id_customer_account_id_idx" ON "containers"("tenant_id", "customer_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "containers_tenant_id_reference_key" ON "containers"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "container_charges_tenant_id_container_id_idx" ON "container_charges"("tenant_id", "container_id");

-- CreateIndex
CREATE INDEX "container_charges_tenant_id_type_status_idx" ON "container_charges"("tenant_id", "type", "status");

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_charges" ADD CONSTRAINT "container_charges_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_charges" ADD CONSTRAINT "container_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
