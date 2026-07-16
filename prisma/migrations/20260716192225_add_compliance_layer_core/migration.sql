-- CreateEnum
CREATE TYPE "ComplianceEntityType" AS ENUM ('TENANT', 'CLIENTE', 'PROVEEDOR', 'SUBCONTRATISTA', 'CONDUCTOR', 'VEHICULO', 'EQUIPO', 'CONTENEDOR', 'MERCANCIA', 'ORDEN', 'VIAJE', 'CONTRATO', 'RUTA', 'TERMINAL', 'NAVIERA', 'AEROPUERTO');

-- CreateEnum
CREATE TYPE "ComplianceDocStatus" AS ENUM ('PENDIENTE', 'EN_REVISION', 'VIGENTE', 'PROXIMO_A_VENCER', 'VENCIDO', 'RECHAZADO', 'SUSPENDIDO', 'REEMPLAZADO', 'NO_APLICABLE');

-- CreateEnum
CREATE TYPE "ComplianceSeverity" AS ENUM ('INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "ComplianceConfidentiality" AS ENUM ('PUBLICO', 'INTERNO', 'RESTRINGIDO', 'CONFIDENCIAL');

-- CreateTable
CREATE TABLE "compliance_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" "ComplianceEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "category" TEXT,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "issuing_authority" TEXT,
    "holder" TEXT,
    "status" "ComplianceDocStatus" NOT NULL DEFAULT 'PENDIENTE',
    "issued_at" TIMESTAMP(3),
    "valid_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "next_renewal_at" TIMESTAMP(3),
    "alert_days_before" INTEGER[] DEFAULT ARRAY[120, 90, 60, 30, 15, 7, 3]::INTEGER[],
    "criticality" "ComplianceSeverity" NOT NULL DEFAULT 'MEDIA',
    "blocks_dispatch" BOOLEAN NOT NULL DEFAULT false,
    "confidentiality" "ComplianceConfidentiality" NOT NULL DEFAULT 'INTERNO',
    "retention_policy" TEXT,
    "file_attachment_id" UUID,
    "file_hash" TEXT,
    "validation_source" TEXT,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "authority" TEXT,
    "source_url" TEXT,
    "published_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "effective_from" TIMESTAMP(3),
    "operation_type" TEXT,
    "severity" "ComplianceSeverity" NOT NULL DEFAULT 'MEDIA',
    "condition" TEXT,
    "recommended_action" TEXT,
    "blocks" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewer_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_documents_tenant_id_entity_type_entity_id_idx" ON "compliance_documents"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "compliance_documents_tenant_id_status_idx" ON "compliance_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "compliance_documents_tenant_id_expires_at_idx" ON "compliance_documents"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "compliance_documents_tenant_id_blocks_dispatch_idx" ON "compliance_documents"("tenant_id", "blocks_dispatch");

-- CreateIndex
CREATE INDEX "compliance_rules_tenant_id_active_idx" ON "compliance_rules"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "compliance_rules_tenant_id_operation_type_idx" ON "compliance_rules"("tenant_id", "operation_type");

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
