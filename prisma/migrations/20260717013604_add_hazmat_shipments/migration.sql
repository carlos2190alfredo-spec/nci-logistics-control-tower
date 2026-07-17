-- CreateEnum
CREATE TYPE "HazmatStatus" AS ENUM ('ORDEN_RECIBIDA', 'VALIDACION_CLIENTE', 'VALIDACION_PRODUCTO', 'DOCUMENTACION_PENDIENTE', 'CONDUCTOR_VALIDADO', 'EQUIPO_VALIDADO', 'PERMISOS_VALIDADOS', 'SEGURO_VALIDADO', 'HOJA_SEGURIDAD_ASOCIADA', 'RUTA_HORARIO_REVISADOS', 'ELEGIBILIDAD_CALCULADA', 'APROBACION_OPERACIONAL', 'PROGRAMADA', 'UNIDAD_DESPACHADA', 'LLEGADA_PUNTO_CARGA', 'CARGA_CONFIRMADA', 'SALIDA_CONFIRMADA', 'EN_TRANSITO', 'LLEGADA_DESTINO', 'RECEPCION_INICIADA', 'RECEPCION_CONFIRMADA', 'DOCUMENTACION_FINAL', 'CONCILIACION', 'EXPEDIENTE_CERRADO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "HazmatClass" AS ENUM ('CLASE_1_EXPLOSIVOS', 'CLASE_2_GASES', 'CLASE_3_LIQUIDOS_INFLAMABLES', 'CLASE_4_SOLIDOS_INFLAMABLES', 'CLASE_5_COMBURENTES', 'CLASE_6_TOXICOS', 'CLASE_7_RADIACTIVOS', 'CLASE_8_CORROSIVOS', 'CLASE_9_VARIOS', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "HazmatComplianceState" AS ENUM ('CUMPLE', 'CUMPLE_CON_OBSERVACIONES', 'NO_CUMPLE', 'NO_VERIFICADO', 'REQUIERE_APROBACION');

-- CreateTable
CREATE TABLE "hazmat_shipments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "HazmatStatus" NOT NULL DEFAULT 'ORDEN_RECIBIDA',
    "compliance_state" "HazmatComplianceState" NOT NULL DEFAULT 'NO_VERIFICADO',
    "product_name" TEXT NOT NULL,
    "product_type" TEXT,
    "un_number" TEXT,
    "hazard_class" "HazmatClass" NOT NULL DEFAULT 'NO_APLICA',
    "safety_data_sheet_ref" TEXT,
    "customer_account_id" UUID,
    "cargo_owner" TEXT,
    "load_point" TEXT,
    "delivery_point" TEXT,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "lot" TEXT,
    "driver_id" UUID,
    "driver_code" TEXT,
    "vehicle_code" TEXT,
    "tank_code" TEXT,
    "capacity" DECIMAL(14,3),
    "compartments" INTEGER,
    "authorized_route" TEXT,
    "authorized_schedule" TEXT,
    "contingency_plan_ref" TEXT,
    "emergency_contacts" TEXT,
    "dispatched_qty" DECIMAL(14,3),
    "received_qty" DECIMAL(14,3),
    "trip_id" UUID,
    "notes" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hazmat_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hazmat_shipments_tenant_id_status_idx" ON "hazmat_shipments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "hazmat_shipments_tenant_id_compliance_state_idx" ON "hazmat_shipments"("tenant_id", "compliance_state");

-- CreateIndex
CREATE INDEX "hazmat_shipments_tenant_id_customer_account_id_idx" ON "hazmat_shipments"("tenant_id", "customer_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "hazmat_shipments_tenant_id_reference_key" ON "hazmat_shipments"("tenant_id", "reference");

-- AddForeignKey
ALTER TABLE "hazmat_shipments" ADD CONSTRAINT "hazmat_shipments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
