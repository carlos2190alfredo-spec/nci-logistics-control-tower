-- Fase 1 de simplificacion (ADR-038): catalogos en autoservicio, pedido creado por operaciones y equipo opcional.
-- Solo cambios aditivos o que relajan una restriccion: no se borra, renombra ni reescribe ningun dato.
-- El codigo anterior sigue funcionando contra este esquema: las columnas nuevas tienen default o admiten nulos
-- y nadie lee trip_assignments, asi que volver nullable equipment_id es seguro ante un rollback del codigo.

-- AlterTable
ALTER TABLE "customer_accounts" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "internal_notes" TEXT,
ADD COLUMN     "tax_id" TEXT;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PORTAL';

-- AlterTable
ALTER TABLE "service_types" ADD COLUMN     "requires_equipment" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "trip_assignments" ALTER COLUMN "equipment_id" DROP NOT NULL;
