-- CreateEnum
CREATE TYPE "ComplianceExceptionGate" AS ENUM ('COMPLIANCE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ComplianceExceptionScope" AS ENUM ('TRIP', 'ASSET');

-- CreateTable
CREATE TABLE "compliance_exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gate" "ComplianceExceptionGate" NOT NULL,
    "scope" "ComplianceExceptionScope" NOT NULL,
    "target_key" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "evidence_ref" TEXT,
    "approver_id" UUID NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_exceptions_tenant_id_gate_scope_idx" ON "compliance_exceptions"("tenant_id", "gate", "scope");

-- CreateIndex
CREATE INDEX "compliance_exceptions_tenant_id_target_key_idx" ON "compliance_exceptions"("tenant_id", "target_key");

-- CreateIndex
CREATE INDEX "compliance_exceptions_tenant_id_expires_at_idx" ON "compliance_exceptions"("tenant_id", "expires_at");

-- AddForeignKey
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
