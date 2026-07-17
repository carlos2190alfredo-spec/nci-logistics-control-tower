import type { ComplianceDocStatus, ComplianceEntityType } from "@/generated/prisma";
import type { HazmatRequirement } from "@/lib/hazmat/readiness";

/** Documento de cumplimiento ya evaluado (estado efectivo por fechas). */
export type EvaluatedDoc = {
  entityType: ComplianceEntityType;
  entityId: string;
  effectiveStatus: ComplianceDocStatus;
};

/** Campos de la orden necesarios para armar la checklist de requisitos. */
export type HazmatRequirementInput = {
  hazardClass: string;
  driverCode?: string | null;
  vehicleCode?: string | null;
  tankCode?: string | null;
  safetyDataSheetRef?: string | null;
  authorizedRoute?: string | null;
  authorizedSchedule?: string | null;
  contingencyPlanRef?: string | null;
};

function norm(v: string): string {
  return v.trim().toLowerCase();
}

/** Estado de un requisito ligado a documentos de una entidad. */
function entityDocState(
  docs: EvaluatedDoc[],
  entityType: ComplianceEntityType,
  entityId: string | null | undefined,
): { present: boolean; valid: boolean } {
  if (!entityId) return { present: false, valid: false };
  const matching = docs.filter(
    (d) => d.entityType === entityType && norm(d.entityId) === norm(entityId),
  );
  return {
    present: matching.length > 0,
    valid: matching.some((d) => d.effectiveStatus === "VIGENTE"),
  };
}

/** Requisito basado en un campo de texto de la orden (presente = no vacío). */
function fieldReq(key: string, label: string, value: string | null | undefined, blocking: boolean): HazmatRequirement {
  const present = Boolean(value && value.trim());
  return { key, label, present, valid: present, blocking };
}

/**
 * Arma la checklist DETERMINISTA de requisitos de una orden de carga peligrosa
 * combinando documentos de cumplimiento verificados y campos de la orden.
 * Pura y testeable; el resultado alimenta `evaluateHazmatReadiness`.
 */
export function assembleHazmatRequirements(
  input: HazmatRequirementInput,
  docs: EvaluatedDoc[],
): HazmatRequirement[] {
  const requirements: HazmatRequirement[] = [];

  const driver = entityDocState(docs, "CONDUCTOR", input.driverCode);
  requirements.push({
    key: "driver_docs",
    label: "Documentación del conductor (licencia/categoría/capacitación)",
    present: driver.present,
    valid: driver.valid,
    blocking: true,
  });

  const vehicle = entityDocState(docs, "VEHICULO", input.vehicleCode);
  requirements.push({
    key: "vehicle_docs",
    label: "Documentación del cabezal (seguro/revisado/permisos)",
    present: vehicle.present,
    valid: vehicle.valid,
    blocking: true,
  });

  const tank = entityDocState(docs, "EQUIPO", input.tankCode);
  requirements.push({
    key: "tank_docs",
    label: "Documentación de la cisterna (PPC/registro técnico)",
    present: tank.present,
    valid: tank.valid,
    blocking: true,
  });

  requirements.push(
    fieldReq("safety_data_sheet", "Hoja de seguridad asociada", input.safetyDataSheetRef, true),
  );
  requirements.push(
    fieldReq("authorized_route", "Ruta autorizada", input.authorizedRoute, false),
  );
  requirements.push(
    fieldReq("authorized_schedule", "Horario autorizado", input.authorizedSchedule, false),
  );
  requirements.push(
    fieldReq("contingency_plan", "Plan de contingencia referenciado", input.contingencyPlanRef, false),
  );

  return requirements;
}
