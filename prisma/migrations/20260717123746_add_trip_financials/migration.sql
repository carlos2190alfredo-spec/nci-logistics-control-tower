-- CreateEnum
CREATE TYPE "FinancialEntryKind" AS ENUM ('INGRESO', 'COSTO');

-- CreateEnum
CREATE TYPE "FinancialCategory" AS ENUM ('TARIFA_BASE', 'RECARGO', 'ESPERA_FACTURABLE', 'DEMURRAGE_FACTURABLE', 'DETENTION_FACTURABLE', 'REEMBOLSABLE', 'SERVICIO_ADICIONAL', 'AJUSTE', 'IMPUESTO', 'COMBUSTIBLE', 'PEAJE', 'VIATICOS', 'CONDUCTOR', 'SUBCONTRATISTA', 'MANTENIMIENTO', 'GASTOS_PORTUARIOS', 'ALMACENAJE', 'RETENCION', 'ESPERA_COSTO', 'DEMURRAGE_COSTO', 'DETENTION_COSTO', 'REENTREGA', 'CARGOS_TERMINAL', 'REPARACION', 'SEGURO', 'ADMINISTRATIVO', 'OTRO');

-- CreateTable
CREATE TABLE "trip_financial_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "kind" "FinancialEntryKind" NOT NULL,
    "category" "FinancialCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_financial_entries_tenant_id_trip_id_idx" ON "trip_financial_entries"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_financial_entries_tenant_id_kind_category_idx" ON "trip_financial_entries"("tenant_id", "kind", "category");

-- AddForeignKey
ALTER TABLE "trip_financial_entries" ADD CONSTRAINT "trip_financial_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_financial_entries" ADD CONSTRAINT "trip_financial_entries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
