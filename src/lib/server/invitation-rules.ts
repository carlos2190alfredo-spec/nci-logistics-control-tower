import type { TenantRole } from "@/generated/prisma";

/**
 * Reglas puras de las invitaciones al equipo (ADR-038). Archivo SIN "use server": un módulo "use server" solo puede
 * exportar funciones async y cada export suyo es un endpoint público. Las usan `invitation-actions.ts` (crear),
 * `invitation-accept.ts` (aceptar) y la página `/invitacion/[token]`.
 */

export const INVITATION_TTL_HOURS = 72;

/** Roles que se pueden conceder por invitación. El propietario NUNCA: se crea al dar de alta la empresa. */
export const INVITABLE_ROLES: readonly TenantRole[] = [
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

/**
 * Contraseña de quien acepta una invitación: la misma política que el restablecimiento (`password-reset.ts`; una
 * prueba estática las mantiene iguales). No se importa de allí para que este módulo siga siendo puro.
 */
export const INVITATION_PASSWORD_MIN_LENGTH = 10;
export const INVITATION_PASSWORD_MAX_LENGTH = 128;
export const INVITATION_NAME_MIN_LENGTH = 2;
export const INVITATION_NAME_MAX_LENGTH = 100;

export function isInvitableRole(role: string): role is TenantRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

/** Un token opaco son 32 bytes en base64url (43 caracteres): lo demás ni se consulta en la base. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export type InvitationStatus = "VALID" | "EXPIRED" | "USED" | "INVALID";

/**
 * Estado de una invitación leída por el hash de su token. `INVALID` cubre lo que no existe y lo que no debería
 * existir (un rol que una invitación nunca concede, p. ej. propietario por manipulación de datos).
 */
export function invitationStatus(
  invitation: { role: string; expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date(),
): InvitationStatus {
  if (!invitation || !isInvitableRole(invitation.role)) return "INVALID";
  if (invitation.usedAt) return "USED";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "VALID";
}

export type InvitationAccount = { kind: "none" } | { kind: "inactive" } | { kind: "active"; userId: string };

/**
 * Qué hacer con una invitación válida según la cuenta del correo invitado y la sesión de quien abre el enlace.
 *
 * - Sin cuenta: se crea (el enlace llegó a ese correo, así que ya es la prueba de que es suyo).
 * - Con cuenta activa: SOLO quien ya inició sesión con esa misma cuenta puede aceptarla. Tener el enlace no basta
 *   para sumar una cuenta existente a una empresa (otra persona podría haberlo reenviado).
 * - Cuenta inactiva: no se acepta ni se explica por qué.
 */
export type InvitationAcceptPlan =
  | { action: "CREATE_ACCOUNT" }
  | { action: "JOIN_EXISTING"; userId: string }
  | { action: "NEEDS_LOGIN" }
  | { action: "WRONG_ACCOUNT" }
  | { action: "UNAVAILABLE" };

export function planInvitationAcceptance(input: {
  account: InvitationAccount;
  sessionUserId: string | null;
}): InvitationAcceptPlan {
  const { account, sessionUserId } = input;
  if (account.kind === "none") return { action: "CREATE_ACCOUNT" };
  if (account.kind === "inactive") return { action: "UNAVAILABLE" };
  if (sessionUserId === null) return { action: "NEEDS_LOGIN" };
  if (sessionUserId !== account.userId) return { action: "WRONG_ACCOUNT" };
  return { action: "JOIN_EXISTING", userId: account.userId };
}
