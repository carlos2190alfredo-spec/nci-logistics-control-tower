import { getDb } from "@/lib/server/db";
import { computeExpiry, reconcileStatus } from "@/lib/compliance/expiry";
import {
  assembleHazmatRequirements,
  type EvaluatedDoc,
} from "@/lib/hazmat/requirements";
import { evaluateHazmatReadiness, type HazmatReadiness } from "@/lib/hazmat/readiness";
import type { ComplianceEntityType, HazmatShipment } from "@/generated/prisma";

export async function getHazmatShipments(tenantId: string): Promise<HazmatShipment[]> {
  return getDb().hazmatShipment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getHazmatShipment(tenantId: string, id: string) {
  return getDb().hazmatShipment.findFirst({ where: { id, tenantId } });
}

/**
 * Calcula la aptitud de cumplimiento (readiness) de una orden hazmat de forma
 * DETERMINISTA: resuelve los documentos de cumplimiento de las entidades de la
 * orden (conductor/cabezal/cisterna), evalúa su vencimiento y arma la checklist.
 * `now` inyectable para pruebas. La IA no interviene.
 */
export async function computeHazmatReadiness(
  tenantId: string,
  shipment: HazmatShipment,
  now: Date = new Date(),
): Promise<HazmatReadiness> {
  const refs: { entityType: ComplianceEntityType; entityId: string }[] = [];
  if (shipment.driverCode) refs.push({ entityType: "CONDUCTOR", entityId: shipment.driverCode });
  if (shipment.vehicleCode) refs.push({ entityType: "VEHICULO", entityId: shipment.vehicleCode });
  if (shipment.tankCode) refs.push({ entityType: "EQUIPO", entityId: shipment.tankCode });

  let evaluated: EvaluatedDoc[] = [];
  if (refs.length > 0) {
    const docs = await getDb().complianceDocument.findMany({
      where: {
        tenantId,
        OR: refs.map((r) => ({ entityType: r.entityType, entityId: r.entityId })),
      },
      take: 500,
    });
    evaluated = docs.map((d) => {
      const derived = computeExpiry({
        expiresAt: d.expiresAt,
        alertDaysBefore: d.alertDaysBefore,
        now,
      });
      return {
        entityType: d.entityType,
        entityId: d.entityId,
        effectiveStatus: reconcileStatus(d.status, derived.derived),
      };
    });
  }

  const requirements = assembleHazmatRequirements(
    {
      hazardClass: shipment.hazardClass,
      driverCode: shipment.driverCode,
      vehicleCode: shipment.vehicleCode,
      tankCode: shipment.tankCode,
      safetyDataSheetRef: shipment.safetyDataSheetRef,
      authorizedRoute: shipment.authorizedRoute,
      authorizedSchedule: shipment.authorizedSchedule,
      contingencyPlanRef: shipment.contingencyPlanRef,
    },
    evaluated,
  );

  return evaluateHazmatReadiness(requirements);
}

export type HazmatCounts = {
  total: number;
  active: number;
  blocked: number;
  needsReview: number;
};

export function summarizeHazmat(rows: HazmatShipment[]): HazmatCounts {
  let active = 0;
  let blocked = 0;
  let needsReview = 0;
  for (const s of rows) {
    if (s.status !== "EXPEDIENTE_CERRADO" && s.status !== "CANCELADA") active += 1;
    if (s.complianceState === "NO_CUMPLE") blocked += 1;
    if (s.complianceState === "NO_VERIFICADO" || s.complianceState === "REQUIERE_APROBACION") {
      needsReview += 1;
    }
  }
  return { total: rows.length, active, blocked, needsReview };
}
