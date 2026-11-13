"use server";

import { z } from "zod";
import { appUrl } from "@/lib/server/app-url";
import { getDb } from "@/lib/server/db";
import { createOpaqueToken, hashToken } from "@/lib/server/crypto";
import { requireTenantRole } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { describeMailError, trySendMail } from "@/lib/server/mail";
import { invitationEmail } from "@/lib/server/email-templates";
import { logger } from "@/lib/server/logger";
import { canGrantRole } from "@/lib/server/membership-rules";
import { consumeOnboardingMailQuota } from "@/lib/server/welcome-mail";
import { tenantRoleLabel } from "@/lib/ui/status";
import type { TenantRole } from "@/generated/prisma";

const INVITATION_TTL_HOURS = 72;
const INVITABLE_ROLES: TenantRole[] = [
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

// Un solo destinatario valido: un valor como "a@x.com,b@y.com" se enviaria a ambos.
const invitationEmailSchema = z.string().trim().toLowerCase().email().max(200);

/** Codigos estables de rechazo: la UI los traduce (no se refleja texto arbitrario en la URL). */
export type InvitationErrorCode = "ROLE_NOT_ALLOWED" | "INVALID_EMAIL" | "ALREADY_MEMBER" | "ALREADY_PENDING" | "RATE_LIMITED";

export async function createInvitation(
  tenantSlug: string,
  email: string,
  role: TenantRole,
): Promise<{ ok: true; warning?: string } | { ok: false; message: string; code: InvitationErrorCode }> {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  if (!INVITABLE_ROLES.includes(role) || !canGrantRole(membership.role, role)) {
    return { ok: false, code: "ROLE_NOT_ALLOWED", message: "Rol no permitido para invitacion." };
  }

  const parsedEmail = invitationEmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { ok: false, code: "INVALID_EMAIL", message: "Correo invalido." };
  }
  const normalizedEmail = parsedEmail.data;

  const db = getDb();

  const existingMember = await db.tenantMembership.findFirst({
    where: { tenantId: tenant.id, user: { email: normalizedEmail }, active: true },
  });
  if (existingMember) {
    return { ok: false, code: "ALREADY_MEMBER", message: "El usuario ya es miembro de este tenant." };
  }

  const existingInvitation = await db.userInvitation.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
  });
  if (existingInvitation && !existingInvitation.usedAt && existingInvitation.expiresAt > new Date()) {
    return { ok: false, code: "ALREADY_PENDING", message: "Ya existe una invitacion pendiente para este correo." };
  }

  // Cada invitacion es un correo saliente desde el dominio de la plataforma: se limita por tenant.
  if (!(await consumeOnboardingMailQuota(tenant.id))) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "Se alcanzo el limite de correos de alta por hora. Intente de nuevo mas tarde.",
    };
  }

  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600000);

  await db.userInvitation.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    update: { tokenHash, expiresAt, role, usedAt: null, invitedById: user.id },
    create: {
      tenantId: tenant.id,
      email: normalizedEmail,
      role,
      tokenHash,
      expiresAt,
      invitedById: user.id,
    },
  });

  // La auditoria va ANTES del correo: la invitacion ya esta confirmada.
  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "invitation.create",
    entity: "UserInvitation",
    after: { email: normalizedEmail, role },
  });

  let mailFailureCode: string | null = null;
  try {
    const content = invitationEmail({
      tenantName: tenant.name,
      role: tenantRoleLabel[role] ?? role,
      invitedBy: user.name,
      inviteUrl: appUrl(`/invitacion/${encodeURIComponent(token)}`),
      expiresInHours: INVITATION_TTL_HOURS,
    });
    const result = await trySendMail(
      { to: normalizedEmail, subject: content.subject, text: content.text, html: content.html },
      { event: "invitation.email_failed", component: "invitations", tenantId: tenant.id },
    );
    if (!result.ok) mailFailureCode = result.code;
  } catch (error) {
    // Falla al construir el enlace (URL publica sin configurar), no al enviar.
    const failure = describeMailError(error);
    logger.error("invitation.email_failed", {
      service: "mail",
      component: "invitations",
      tenantId: tenant.id,
      outcome: "FAILED",
      errorCode: failure.code,
      safeMessage: failure.message,
    });
    mailFailureCode = failure.code;
  }

  if (mailFailureCode) {
    // La invitacion ya esta registrada: no se aborta. Como el invitado nunca recibio
    // el enlace, se vence de inmediato para que no bloquee un nuevo envio
    // ("Ya existe una invitacion pendiente") y se deja constancia en la auditoria.
    await db.userInvitation
      .updateMany({ where: { tenantId: tenant.id, email: normalizedEmail, tokenHash }, data: { expiresAt: new Date() } })
      .catch(() => undefined);
    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: "invitation.email_failed",
      entity: "UserInvitation",
      after: { email: normalizedEmail, role, errorCode: mailFailureCode },
    });
    return {
      ok: true,
      warning: "No se pudo enviar el correo de invitacion. Revise la configuracion de correo y vuelva a enviarla.",
    };
  }

  return { ok: true };
}

export async function listPendingInvitations(tenantSlug: string) {
  const { tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const db = getDb();
  return db.userInvitation.findMany({
    where: { tenantId: tenant.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true, email: true } },
    },
  });
}

export async function revokeInvitation(tenantSlug: string, invitationId: string) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const db = getDb();
  const invitation = await db.userInvitation.findFirst({
    where: { id: invitationId, tenantId: tenant.id, usedAt: null },
  });

  if (!invitation) {
    return { ok: false, message: "Invitacion no encontrada o ya utilizada." };
  }

  await db.userInvitation.delete({ where: { id: invitationId } });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "invitation.revoke",
    entity: "UserInvitation",
    entityId: invitationId,
    after: { email: invitation.email },
  });

  return { ok: true };
}
