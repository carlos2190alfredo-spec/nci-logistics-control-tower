import type { ComplianceDocStatus } from "@/generated/prisma";
import type { ComplianceLight } from "@/lib/ui/compliance";
import { computeExpiry, documentBlocksNow, reconcileStatus } from "@/lib/compliance/expiry";

/** Forma mínima de documento requerida para evaluar el semáforo. */
export type EvaluableDocument = {
  status: ComplianceDocStatus;
  expiresAt: Date | null;
  alertDaysBefore: number[];
  blocksDispatch: boolean;
};

export type EvaluatedDocument<T extends EvaluableDocument = EvaluableDocument> = T & {
  effectiveStatus: ComplianceDocStatus;
  daysUntilExpiry: number | null;
  blocksNow: boolean;
};

export type ComplianceSummary<T extends EvaluableDocument = EvaluableDocument> = {
  light: ComplianceLight;
  documents: EvaluatedDocument<T>[];
  counts: Record<ComplianceDocStatus, number>;
  blockingCount: number;
};

function emptyCounts(): Record<ComplianceDocStatus, number> {
  return {
    PENDIENTE: 0,
    EN_REVISION: 0,
    VIGENTE: 0,
    PROXIMO_A_VENCER: 0,
    VENCIDO: 0,
    RECHAZADO: 0,
    SUSPENDIDO: 0,
    REEMPLAZADO: 0,
    NO_APLICABLE: 0,
  };
}

/**
 * Evalúa un conjunto de documentos y devuelve el semáforo global determinista.
 *
 * Política (determinista, sin IA):
 * - ROJO: algún documento que bloquea despacho está VENCIDO/SUSPENDIDO/RECHAZADO.
 * - GRIS: sin rojos, pero algún documento que bloquea despacho está PENDIENTE o
 *   EN_REVISION (información incompleta / no verificada).
 * - AMARILLO: sin rojos ni grises, pero hay algún PROXIMO_A_VENCER o VENCIDO
 *   (no bloqueante) → advertencias.
 * - VERDE: todo en regla.
 */
export function summarizeCompliance<T extends EvaluableDocument>(
  docs: T[],
  now: Date,
): ComplianceSummary<T> {
  const counts = emptyCounts();
  let blockingCount = 0;
  let anyIncompleteBlocker = false;
  let anyWarning = false;

  const documents: EvaluatedDocument<T>[] = docs.map((doc) => {
    const expiry = computeExpiry({
      expiresAt: doc.expiresAt,
      alertDaysBefore: doc.alertDaysBefore,
      now,
    });
    const effectiveStatus = reconcileStatus(doc.status, expiry.derived);
    const blocksNow = documentBlocksNow({ blocksDispatch: doc.blocksDispatch, status: effectiveStatus });

    counts[effectiveStatus] += 1;
    if (blocksNow) blockingCount += 1;
    if (doc.blocksDispatch && (effectiveStatus === "PENDIENTE" || effectiveStatus === "EN_REVISION")) {
      anyIncompleteBlocker = true;
    }
    if (effectiveStatus === "PROXIMO_A_VENCER" || effectiveStatus === "VENCIDO") {
      anyWarning = true;
    }

    return { ...doc, effectiveStatus, daysUntilExpiry: expiry.daysUntilExpiry, blocksNow };
  });

  let light: ComplianceLight;
  if (blockingCount > 0) light = "ROJO";
  else if (anyIncompleteBlocker) light = "GRIS";
  else if (anyWarning) light = "AMARILLO";
  else light = "VERDE";

  return { light, documents, counts, blockingCount };
}
