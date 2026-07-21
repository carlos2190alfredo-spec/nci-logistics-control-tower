/**
 * Modo soporte auditado — helpers puros de sesión de soporte.
 * PURO: sin BD ni IA. Una sesión está ACTIVA si no está cerrada
 * (`endedAt == null`) y no ha expirado.
 */

export type SupportSessionLite = {
  startedAt: Date;
  endedAt: Date | null;
  expiresAt: Date | null;
};

export function isSupportActive(s: SupportSessionLite, now: Date): boolean {
  if (s.endedAt) return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Minutos restantes de una sesión activa (0 si ya expiró o no aplica). */
export function minutesRemaining(s: SupportSessionLite, now: Date): number {
  if (!isSupportActive(s, now) || !s.expiresAt) return 0;
  const diffMs = s.expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 60_000));
}
