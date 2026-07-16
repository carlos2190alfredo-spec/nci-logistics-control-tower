import { getDb } from "@/lib/server/db";
import { summarizeCompliance, type ComplianceSummary } from "@/lib/compliance/summary";
import { filterDocsForRefs, tripEntityRefs } from "@/lib/compliance/eligibility";
import type { ComplianceLight } from "@/lib/ui/compliance";
import type { ComplianceDocument } from "@/generated/prisma";

export type ComplianceDocumentRow = ComplianceDocument;

/** Viaje mínimo para evaluar elegibilidad (conductor + vehículo). */
export type EligibilityTrip = {
  id: string;
  driver: { code: string } | null;
  vehicle: { code: string; plate: string } | null;
};

/**
 * Calcula el semáforo de elegibilidad de varios viajes con UNA sola consulta
 * (evita N+1): trae los documentos del tenant una vez y filtra por viaje.
 * Advisory — no bloquea; sólo informa.
 */
export async function getTripsEligibility(
  tenantId: string,
  trips: EligibilityTrip[],
  now: Date = new Date(),
): Promise<Map<string, ComplianceLight>> {
  const result = new Map<string, ComplianceLight>();
  if (trips.length === 0) return result;

  const docs = await getDb().complianceDocument.findMany({
    where: { tenantId },
    take: 2000,
  });

  for (const trip of trips) {
    const refs = tripEntityRefs({
      driverCode: trip.driver?.code,
      vehicleCode: trip.vehicle?.code,
      vehiclePlate: trip.vehicle?.plate,
    });
    const relevant = filterDocsForRefs(docs, refs);
    // Sin documentos relevantes => no hay base para evaluar (GRIS: incompleto).
    if (relevant.length === 0) {
      result.set(trip.id, "GRIS");
      continue;
    }
    result.set(trip.id, summarizeCompliance(relevant, now).light);
  }

  return result;
}

/**
 * Trae los documentos de cumplimiento del tenant y calcula el semáforo global
 * de forma determinista. `now` inyectable para pruebas.
 */
export async function getComplianceOverview(
  tenantId: string,
  now: Date = new Date(),
): Promise<ComplianceSummary<ComplianceDocumentRow>> {
  const docs = await getDb().complianceDocument.findMany({
    where: { tenantId },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return summarizeCompliance(docs, now);
}

export async function getComplianceDocument(tenantId: string, id: string) {
  return getDb().complianceDocument.findFirst({ where: { id, tenantId } });
}
