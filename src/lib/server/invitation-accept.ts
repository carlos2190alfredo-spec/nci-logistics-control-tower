import type { PrismaClient, TenantRole } from "@/generated/prisma";
import { hashPassword, hashToken } from "@/lib/server/crypto";
import { isUniqueViolation } from "@/lib/server/db-errors";
import {
  INVITATION_NAME_MAX_LENGTH,
  INVITATION_NAME_MIN_LENGTH,
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  INVITATION_TOKEN_PATTERN,
  invitationStatus,
  planInvitationAcceptance,
  type InvitationAccount,
  type InvitationAcceptPlan,
} from "@/lib/server/invitation-rules";

/**
 * Aceptación de invitaciones al equipo (ADR-038). Módulo SIN "use server": lo llaman la página `/invitacion/[token]`
 * y `acceptInvitationAction`, y las pruebas con base real lo llaman con su propio cliente.
 *
 * - El token llega en claro solo en el enlace; en la base solo existe su hash SHA-256.
 * - El enlace es de un solo uso: se "reclama" con un `updateMany` condicional (`usedAt` nulo y no vencida) dentro de
 *   la misma transacción que crea la cuenta y la membresía. Dos aceptaciones simultáneas: gana una.
 * - Una cuenta que ya existe NO se une con solo tener el enlace: debe haber iniciado sesión con esa cuenta
 *   (`planInvitationAcceptance`).
 */

type Db = Pick<PrismaClient, "userInvitation" | "user" | "$transaction">;

export type InvitationView = {
  tenantName: string;
  email: string;
  role: TenantRole;
  invitedByName: string;
  expiresAt: Date;
  plan: InvitationAcceptPlan;
};

export type InvitationLookup =
  | { ok: true; invitation: InvitationView }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" };

type LoadedInvitation = NonNullable<Awaited<ReturnType<typeof loadInvitation>>>;

async function loadInvitation(db: Db, token: string) {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
  return db.userInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      tokenHash: true,
      tenant: { select: { id: true, slug: true, name: true, status: true } },
      invitedBy: { select: { name: true } },
    },
  });
}

async function accountFor(db: Db, email: string): Promise<InvitationAccount> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, active: true } });
  if (!user) return { kind: "none" };
  return user.active ? { kind: "active", userId: user.id } : { kind: "inactive" };
}

/** Una empresa suspendida o archivada no recibe gente nueva: el enlace deja de servir como si no existiera. */
function usable(invitation: LoadedInvitation | null, now: Date) {
  if (!invitation) return { ok: false as const, reason: "INVALID" as const };
  const status = invitationStatus(invitation, now);
  if (status !== "VALID") return { ok: false as const, reason: status };
  if (invitation.tenant.status !== "ACTIVE") return { ok: false as const, reason: "INVALID" as const };
  return { ok: true as const, invitation };
}

/** Lo que muestra la página: nunca devuelve el hash ni ids internos. `sessionUserId` es quien abrió el enlace, si hay sesión. */
export async function lookupInvitation(db: Db, token: string, sessionUserId: string | null, now: Date = new Date()): Promise<InvitationLookup> {
  const checked = usable(await loadInvitation(db, token), now);
  if (!checked.ok) return checked;
  const { invitation } = checked;
  const plan = planInvitationAcceptance({ account: await accountFor(db, invitation.email), sessionUserId });
  return {
    ok: true,
    invitation: {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      role: invitation.role,
      invitedByName: invitation.invitedBy.name,
      expiresAt: invitation.expiresAt,
      plan,
    },
  };
}

export type AcceptFailure =
  | "INVALID"
  | "EXPIRED"
  | "USED"
  | "NEEDS_LOGIN"
  | "WRONG_ACCOUNT"
  | "UNAVAILABLE"
  | "ALREADY_MEMBER"
  | "INVALID_INPUT";

export type AcceptOutcome =
  | { ok: true; newAccount: boolean; userId: string; tenantId: string; tenantSlug: string; role: TenantRole; invitationId: string }
  | { ok: false; reason: AcceptFailure; message?: string; field?: "name" | "password" | "confirmation" };

type NewAccountField = "name" | "password" | "confirmation";

function validateNewAccount(input: { name?: string; password?: string; confirmation?: string }): { ok: true; name: string; password: string } | { ok: false; message: string; field: NewAccountField } {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < INVITATION_NAME_MIN_LENGTH || name.length > INVITATION_NAME_MAX_LENGTH) {
    return { ok: false, field: "name", message: `Escriba su nombre (entre ${INVITATION_NAME_MIN_LENGTH} y ${INVITATION_NAME_MAX_LENGTH} caracteres).` };
  }
  const password = input.password ?? "";
  if (password.length < INVITATION_PASSWORD_MIN_LENGTH) {
    return { ok: false, field: "password", message: `La contraseña debe tener al menos ${INVITATION_PASSWORD_MIN_LENGTH} caracteres.` };
  }
  if (password.length > INVITATION_PASSWORD_MAX_LENGTH) {
    return { ok: false, field: "password", message: `La contraseña no puede superar ${INVITATION_PASSWORD_MAX_LENGTH} caracteres.` };
  }
  if (password !== (input.confirmation ?? "")) return { ok: false, field: "confirmation", message: "Las contraseñas no coinciden." };
  return { ok: true, name, password };
}

/**
 * Acepta una invitación. `sessionUserId` es el usuario con sesión COMPLETA (no la de MFA pendiente), nunca un dato
 * del formulario. El correo de la cuenta sale de la invitación, no del navegador.
 */
export async function acceptInvitation(
  db: Db,
  input: { token: string; sessionUserId: string | null; name?: string; password?: string; confirmation?: string },
  now: Date = new Date(),
): Promise<AcceptOutcome> {
  const checked = usable(await loadInvitation(db, input.token), now);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const { invitation } = checked;

  const plan = planInvitationAcceptance({ account: await accountFor(db, invitation.email), sessionUserId: input.sessionUserId });
  if (plan.action === "NEEDS_LOGIN" || plan.action === "WRONG_ACCOUNT" || plan.action === "UNAVAILABLE") {
    return { ok: false, reason: plan.action };
  }

  // El hash de argon2 es lento: se calcula ANTES de abrir la transacción, no con el enlace reclamado.
  let newAccount: { name: string; passwordHash: string } | null = null;
  if (plan.action === "CREATE_ACCOUNT") {
    const valid = validateNewAccount(input);
    if (!valid.ok) return { ok: false, reason: "INVALID_INPUT", message: valid.message };
    newAccount = { name: valid.name, passwordHash: await hashPassword(valid.password) };
  }

  try {
    return await db.$transaction(async (tx): Promise<AcceptOutcome> => {
      const claimed = await tx.userInvitation.updateMany({
        where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return { ok: false, reason: "USED" };

      let userId: string;
      if (newAccount) {
        // La invitación llegó al correo, así que quien la abre lo controla: el correo queda verificado.
        const created = await tx.user.create({
          data: { name: newAccount.name, email: invitation.email, passwordHash: newAccount.passwordHash, emailVerified: true },
          select: { id: true },
        });
        userId = created.id;
      } else if (plan.action === "JOIN_EXISTING") {
        userId = plan.userId;
      } else {
        throw new Error("Plan de invitación inesperado.");
      }

      // Con cualquier membresía previa (activa o no) NO se agrega otro rol: así no se escala un rol por invitación y
      // un usuario desactivado lo reactiva un administrador a propósito. La invitación queda consumida.
      const existing = await tx.tenantMembership.findFirst({ where: { tenantId: invitation.tenant.id, userId }, select: { id: true } });
      if (existing) return { ok: false, reason: "ALREADY_MEMBER" };

      await tx.tenantMembership.create({ data: { tenantId: invitation.tenant.id, userId, role: invitation.role } });
      return {
        ok: true,
        newAccount: newAccount !== null,
        userId,
        tenantId: invitation.tenant.id,
        tenantSlug: invitation.tenant.slug,
        role: invitation.role,
        invitationId: invitation.id,
      };
    });
  } catch (error) {
    // Alguien creó una cuenta con ese correo entre la comprobación y el alta: se revirtió todo (el enlace sigue
    // vigente); iniciando sesión con esa cuenta se puede aceptar.
    if (isUniqueViolation(error, "email")) return { ok: false, reason: "NEEDS_LOGIN" };
    throw error;
  }
}
