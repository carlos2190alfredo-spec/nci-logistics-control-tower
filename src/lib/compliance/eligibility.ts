import type { ComplianceDocStatus, ComplianceEntityType } from "@/generated/prisma";
import type { EvaluableDocument } from "@/lib/compliance/summary";
import { computeExpiry, documentBlocksNow, reconcileStatus } from "@/lib/compliance/expiry";

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

/**
 * Documento evaluable con el conjunto mínimo de campos para decidir bloqueo.
 * Se acepta la forma directa del modelo Prisma (fechas + alertDaysBefore +
 * blocksDispatch + status).
 */
export type BlockingCandidate = {
  status: ComplianceDocStatus;
  expiresAt: Date | null;
  alertDaysBefore: number[];
  blocksDispatch: boolean;
  entityType?: string;
  entityId?: string;
  name?: string;
};

export type BlockingDocument<T extends BlockingCandidate = BlockingCandidate> = T & {
  effectiveStatus: ComplianceDocStatus;
};

/**
 * Devuelve los documentos que bloquean AHORA (blocksDispatch=true y estado
 * efectivo VENCIDO/SUSPENDIDO/RECHAZADO). Determinista, sin base de datos.
 */
export function blockingDocumentsNow<T extends BlockingCandidate>(
  docs: T[],
  now: Date,
): BlockingDocument<T>[] {
  const out: BlockingDocument<T>[] = [];
  for (const doc of docs) {
    const derived = computeExpiry({
      expiresAt: doc.expiresAt,
      alertDaysBefore: doc.alertDaysBefore,
      now,
    });
    const effectiveStatus = reconcileStatus(doc.status, derived.derived);
    if (documentBlocksNow({ blocksDispatch: doc.blocksDispatch, status: effectiveStatus })) {
      out.push({ ...doc, effectiveStatus });
    }
  }
  return out;
}
