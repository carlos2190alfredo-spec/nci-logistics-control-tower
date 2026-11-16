/**
 * Reglas puras para dar acceso al portal a una persona (ADR-038, revision SEC-01/INT-10).
 *
 * Una identidad de portal pertenece a UN solo transportista en la Fase 1: si el correo ya tiene cuenta y no
 * tiene ninguna membresia en ESTE tenant, no se vincula en silencio (podria llevar a esa persona a un portal
 * ajeno) y la respuesta es neutra, igual que para personal de plataforma o cuentas inactivas, para no revelar
 * que correos existen. Sin I/O: se prueba como `membership-rules.ts`.
 */
export type PortalMembershipFact = { id: string; customerAccountId: string; role: string; active: boolean };

export type PortalGrantFacts = {
  /** null = el correo no tiene cuenta. */
  existingUser: { active: boolean; platformRole: string | null } | null;
  /** Solo membresias de cliente de ESTE tenant. */
  customerMemberships: PortalMembershipFact[];
  /** true si la persona ya forma parte del equipo de ESTE tenant. */
  isTeamMember: boolean;
  target: { customerAccountId: string; role: string };
};

export type PortalGrantDecision =
  | { kind: "create_user_and_membership" }
  | { kind: "reactivate_membership"; membershipId: string }
  | { kind: "already_has_access" }
  | { kind: "reject"; scope: "global" | "local"; reason: string; message: string };

export const GLOBAL_REJECT_MESSAGE = "No se pudo dar acceso con ese correo. Use otro correo o contacte a soporte de NCI.";

const reject = (scope: "global" | "local", reason: string, message: string): PortalGrantDecision => ({ kind: "reject", scope, reason, message });

export function evaluatePortalAccessGrant(facts: PortalGrantFacts): PortalGrantDecision {
  const { existingUser, customerMemberships, isTeamMember, target } = facts;
  if (!existingUser) return { kind: "create_user_and_membership" };

  // Ambito global: misma respuesta, sin importar el motivo real (este va solo a la auditoria).
  if (existingUser.platformRole) return reject("global", "platform_user", GLOBAL_REJECT_MESSAGE);
  if (!existingUser.active) return reject("global", "inactive_user", GLOBAL_REJECT_MESSAGE);

  if (isTeamMember) return reject("local", "team_member", "Esa persona ya forma parte de su equipo.");

  if (customerMemberships.length === 0) return reject("global", "account_elsewhere", GLOBAL_REJECT_MESSAGE);

  const sameAccount = customerMemberships.filter((m) => m.customerAccountId === target.customerAccountId);
  const activeElsewhere = customerMemberships.some((m) => m.active && m.customerAccountId !== target.customerAccountId);
  if (activeElsewhere) {
    return reject("local", "other_customer", "Esa persona ya tiene acceso al portal de otro cliente de su empresa.");
  }
  const activeSame = sameAccount.find((m) => m.active);
  if (activeSame) {
    if (activeSame.role === target.role) return { kind: "already_has_access" };
    return reject(
      "local",
      "other_role",
      "Esa persona ya tiene acceso a este cliente con otro rol. Desactive su acceso y vuelva a darlo con el rol que necesita.",
    );
  }
  const inactiveSame = sameAccount[0];
  if (inactiveSame) return { kind: "reactivate_membership", membershipId: inactiveSame.id };
  return reject("global", "account_elsewhere", GLOBAL_REJECT_MESSAGE);
}
