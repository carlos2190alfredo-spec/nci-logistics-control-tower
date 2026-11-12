-- Flujos de excepcion (ADR-035): entrega fallida, motivo de transiciones y de cambios de estado de solicitudes.
-- Solo cambios aditivos: no se borra ni reescribe ningun dato.

-- AlterEnum
ALTER TYPE "TripStatus" ADD VALUE 'DELIVERY_FAILED' AFTER 'DELIVERY_IN_PROGRESS';

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN "status_reason" TEXT;

-- AlterTable
ALTER TABLE "trip_events" ADD COLUMN "reason" TEXT;
