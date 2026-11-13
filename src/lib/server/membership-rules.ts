import type { TenantRole } from "@/generated/prisma";

/**
 * Reglas de jerarquia para crear, editar y activar/desactivar membresias de un
 * tenant. Son puras (sin DB) para poder probarlas; las server actions las
 * aplican en el servidor, nunca confian en lo que ofrezca la UI.
 *
 * - Solo `TENANT_OWNER` puede otorgar `TENANT_OWNER`.
 * - Un `TENANT_ADMIN` no puede modificar, degradar ni desactivar a un `TENANT_OWNER`.
 * - Nadie cambia su propio rol ni se desactiva a si mismo.
 * - El tenant conserva siempre al menos un propietario activo.
 *
 * Archivo SIN "use server": un modulo "use server" solo puede exportar funciones async.
 */

export type MembershipDenialCode =
  | "ACTOR_NOT_ALLOWED"
  | "ROLE_NOT_GRANTABLE"
  | "OWNER_PROTECTED"
  | "SELF_CHANGE"
  | "LAST_OWNER";

export type MembershipDecision =
  | { ok: true }
  | { ok: false; code: MembershipDenialCode; message: string };

export type MembershipChange = {
  actor: { userId: string; role: TenantRole };
  /** Membresia existente que se edita o activa/desactiva. Ausente al crear. */
  target?: { userId: string; role: TenantRole; active: boolean };
  /** Estado resultante: al crear, el rol otorgado; al editar, rol y activo resultantes. */
  next: { role: TenantRole; active: boolean };
  /**
   * Propietarios activos del tenant ANTES del cambio. Solo se consulta cuando el
   * objetivo es un propietario activo; si falta, la regla falla cerrada.
   */
  activeOwnerCount?: number;
};

const MESSAGES: Record<MembershipDenialCode, string> = {
  ACTOR_NOT_ALLOWED:
    "No tiene permiso para administrar usuarios de este tenant.",
  ROLE_NOT_GRANTABLE:
    "Solo un propietario puede otorgar el rol de propietario.",
  OWNER_PROTECTED:
    "Solo un propietario puede modificar, degradar o desactivar a otro propietario.",
  SELF_CHANGE: "No puede cambiar su propio rol ni desactivar su propia cuenta.",
  LAST_OWNER: "El tenant debe conservar al menos un propietario activo.",
};

/** Roles que un `TENANT_ADMIN` puede otorgar (todos salvo propietario). */
export function canGrantRole(actorRole: TenantRole, role: TenantRole): boolean {
  if (actorRole === "TENANT_OWNER") return true;
  if (actorRole === "TENANT_ADMIN") return role !== "TENANT_OWNER";
  return false;
}

function deny(code: MembershipDenialCode): MembershipDecision {
  return { ok: false, code, message: MESSAGES[code] };
}

export function evaluateMembershipChange(
  change: MembershipChange,
): MembershipDecision {
  const { actor, target, next } = change;

  if (actor.role !== "TENANT_OWNER" && actor.role !== "TENANT_ADMIN")
    return deny("ACTOR_NOT_ALLOWED");

  if (!canGrantRole(actor.role, next.role)) return deny("ROLE_NOT_GRANTABLE");

  if (target) {
    if (target.role === "TENANT_OWNER" && actor.role !== "TENANT_OWNER")
      return deny("OWNER_PROTECTED");

    if (
      target.userId === actor.userId &&
      (next.role !== target.role || next.active !== target.active)
    ) {
      return deny("SELF_CHANGE");
    }

    const stopsBeingActiveOwner =
      target.role === "TENANT_OWNER" &&
      target.active &&
      (next.role !== "TENANT_OWNER" || !next.active);
    if (stopsBeingActiveOwner && (change.activeOwnerCount ?? 0) <= 1)
      return deny("LAST_OWNER");
  }

  return { ok: true };
}

/** Error para abortar una transaccion cuando una regla de membresia se incumple. */
export class MembershipRuleError extends Error {
  constructor(public readonly code: MembershipDenialCode) {
    super(MESSAGES[code]);
    this.name = "MembershipRuleError";
  }
}
