import type { ComplianceEntityType } from "@/generated/prisma";
import type { EvaluableDocument } from "@/lib/compliance/summary";

/** Referencia a una entidad de negocio para resolver sus documentos. */
export type EntityRef = { entityType: ComplianceEntityType; entityId: string };

function norm(v: string): string {
  return v.trim().toLowerCase();
}

function refKey(entityType: ComplianceEntityType, entityId: string): string {
  return `${entityType}:${norm(entityId)}`;
}

/**
 * Filtra un conjunto de documentos a los que corresponden a CUALQUIERA de las
 * referencias dadas. Comparación de `entityId` insensible a mayúsculas y
 * espacios (placas/códigos suelen variar en formato). Puro y determinista.
 */
export function filterDocsForRefs<T extends EvaluableDocument & { entityType: ComplianceEntityType; entityId: string }>(
  docs: T[],
  refs: EntityRef[],
): T[] {
  if (refs.length === 0) return [];
  const wanted = new Set(refs.map((r) => refKey(r.entityType, r.entityId)));
  return docs.filter((d) => wanted.has(refKey(d.entityType, d.entityId)));
}

/**
 * Construye las referencias de cumplimiento relevantes para un viaje a partir
 * de su conductor y vehículo (por código y placa). Se ignoran valores vacíos.
 */
export function tripEntityRefs(input: {
  driverCode?: string | null;
  vehicleCode?: string | null;
  vehiclePlate?: string | null;
  equipmentCode?: string | null;
}): EntityRef[] {
  const refs: EntityRef[] = [];
  if (input.driverCode) refs.push({ entityType: "CONDUCTOR", entityId: input.driverCode });
  if (input.vehicleCode) refs.push({ entityType: "VEHICULO", entityId: input.vehicleCode });
  if (input.vehiclePlate) refs.push({ entityType: "VEHICULO", entityId: input.vehiclePlate });
  if (input.equipmentCode) refs.push({ entityType: "EQUIPO", entityId: input.equipmentCode });
  return refs;
}
