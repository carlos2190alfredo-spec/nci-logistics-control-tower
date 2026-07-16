import type { ComplianceDocStatus } from "@/generated/prisma";

/**
 * Panama Logistics Compliance Layer — cómputo determinista de vencimiento.
 *
 * Este módulo es PURO: no toca la base de datos ni la IA. La elegibilidad y
 * el estado de un documento se derivan exclusivamente de fechas verificadas y
 * ventanas de alerta configurables. La IA nunca decide esto.
 */

export type DerivedExpiry =
  | "SIN_VENCIMIENTO"
  | "VIGENTE"
  | "PROXIMO_A_VENCER"
  | "VENCIDO";

export type ExpiryResult = {
  derived: DerivedExpiry;
  /** Días hasta el vencimiento (negativo si ya venció). null si no aplica. */
  daysUntilExpiry: number | null;
  /**
   * Umbral de alerta cruzado más cercano (p.ej. 30), si `daysUntilExpiry`
   * cayó dentro de alguna ventana de `alertDaysBefore`. null si ninguno.
   */
  crossedThreshold: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días calendario (redondeo hacia arriba) entre `now` y `target`. */
export function daysBetween(now: Date, target: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Calcula el estado de vencimiento derivado de un documento.
 * - Sin `expiresAt` → SIN_VENCIMIENTO.
 * - `now` >= `expiresAt` → VENCIDO.
 * - `daysUntilExpiry` dentro de la mayor ventana de alerta → PROXIMO_A_VENCER.
 * - En otro caso → VIGENTE.
 */
export function computeExpiry(input: {
  expiresAt: Date | null | undefined;
  alertDaysBefore?: number[];
  now: Date;
}): ExpiryResult {
  const { expiresAt, now } = input;
  const alerts = (input.alertDaysBefore ?? []).filter((n) => Number.isFinite(n) && n >= 0);

  if (!expiresAt) {
    return { derived: "SIN_VENCIMIENTO", daysUntilExpiry: null, crossedThreshold: null };
  }

  const days = daysBetween(now, expiresAt);

  if (days <= 0) {
    return { derived: "VENCIDO", daysUntilExpiry: days, crossedThreshold: null };
  }

  // Umbrales cruzados: aquellos >= days (ya estamos dentro de esa ventana).
  const crossed = alerts.filter((threshold) => days <= threshold);
  const crossedThreshold = crossed.length > 0 ? Math.min(...crossed) : null;

  if (crossedThreshold !== null) {
    return { derived: "PROXIMO_A_VENCER", daysUntilExpiry: days, crossedThreshold };
  }

  return { derived: "VIGENTE", daysUntilExpiry: days, crossedThreshold: null };
}

/**
 * Estados terminales fijados manualmente que tienen prioridad sobre la
 * derivación por fechas (un documento rechazado sigue rechazado aunque su
 * fecha aún sea válida).
 */
const MANUAL_OVERRIDES: ReadonlySet<ComplianceDocStatus> = new Set([
  "PENDIENTE",
  "EN_REVISION",
  "RECHAZADO",
  "SUSPENDIDO",
  "REEMPLAZADO",
  "NO_APLICABLE",
]);

/**
 * Reconcilia el estado guardado con el derivado por fechas.
 * Si el estado manual es un override terminal, se respeta. Si es un estado
 * "vigente/vencido/proximo" (o desconocido), la derivación por fechas manda.
 */
export function reconcileStatus(
  manual: ComplianceDocStatus,
  derived: DerivedExpiry,
): ComplianceDocStatus {
  if (MANUAL_OVERRIDES.has(manual)) return manual;
  switch (derived) {
    case "VENCIDO":
      return "VENCIDO";
    case "PROXIMO_A_VENCER":
      return "PROXIMO_A_VENCER";
    case "VIGENTE":
    case "SIN_VENCIMIENTO":
      return "VIGENTE";
  }
}

/** ¿Este documento debe bloquear el despacho ahora mismo? */
export function documentBlocksNow(input: {
  blocksDispatch: boolean;
  status: ComplianceDocStatus;
}): boolean {
  if (!input.blocksDispatch) return false;
  return input.status === "VENCIDO" || input.status === "SUSPENDIDO" || input.status === "RECHAZADO";
}
