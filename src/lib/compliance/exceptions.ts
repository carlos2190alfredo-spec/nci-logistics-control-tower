import type { ComplianceExceptionGate, ComplianceExceptionScope } from "@/generated/prisma";

/**
 * Excepciones de elegibilidad — decisión humana, auditada, determinista.
 * Puro: sin base de datos ni IA. La IA no aprueba excepciones.
 */

export type ExceptionLite = {
  gate: ComplianceExceptionGate;
  scope: ComplianceExceptionScope;
  /**
   * TRIP: id del viaje.
   * ASSET: "VEHICULO:CODE" / "EQUIPO:CODE" / "CONDUCTOR:CODE".
   */
  targetKey: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
};

/** ¿La excepción está vigente ahora? (no expirada, no revocada). */
export function isExceptionActive(ex: ExceptionLite, now: Date): boolean {
  if (ex.revokedAt) return false;
  if (ex.expiresAt && ex.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Determina si existe una excepción vigente para un despacho, dado el conjunto
 * de excepciones del tenant y las claves del viaje/activos afectados.
 *
 * Una excepción cubre el gate si:
 * - scope=TRIP  y targetKey === tripId
 * - scope=ASSET y targetKey ∈ assetKeys (p.ej. "VEHICULO:VH-1")
 */
export function hasActiveException(
  exceptions: ExceptionLite[],
  gate: ComplianceExceptionGate,
  input: { tripId: string; assetKeys: string[] },
  now: Date,
): boolean {
  const assets = new Set(input.assetKeys);
  for (const ex of exceptions) {
    if (ex.gate !== gate) continue;
    if (!isExceptionActive(ex, now)) continue;
    if (ex.scope === "TRIP" && ex.targetKey === input.tripId) return true;
    if (ex.scope === "ASSET" && assets.has(ex.targetKey)) return true;
  }
  return false;
}
