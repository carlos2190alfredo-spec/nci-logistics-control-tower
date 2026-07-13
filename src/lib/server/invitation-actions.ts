"use server";

import { getDb } from "@/lib/server/db";
import { createOpaqueToken, hashToken } from "@/lib/server/crypto";
import { requireTenantRole } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { sendMail } from "@/lib/server/mail";
import type { TenantRole } from "@/generated/prisma/enums";

const INVITATION_TTL_HOURS = 72;
const INVITABLE_ROLES: TenantRole[] = [
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

export async function createInvitation(
  tenantSlug: string,
  email: string,
  role: TenantRole,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  if (!INVITABLE_ROLES.includes(role)) {
    return { ok: false, message: "Rol no permitido para invitacion." };
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, message: "Correo invalido." };
  }

  const db = getDb();

  const existingMember = await db.tenantMembership.findFirst({
    where: { tenantId: tenant.id, user: { email: normalizedEmail }, active: true },
  });
  if (existingMember) {
    return { ok: false, message: "El usuario ya es miembro de este tenant." };
  }

  const existingInvitation = await db.userInvitation.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
  });
  if (existingInvitation && !existingInvitation.usedAt && existingInvitation.expiresAt > new Date()) {
    return { ok: false, message: "Ya existe una invitacion pendiente para este correo." };
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

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invitacion/${token}`;

  await sendMail({
    to: normalizedEmail,
    subject: `Invitacion a ${tenant.name} — NCI LCT`,
    text: [
      `Hola,`,
      ``,
      `Has sido invitado a unirte a ${tenant.name} en NCI Logistics Control Tower con el rol de ${role}.`,
      ``,
      `Para aceptar la invitacion, visita:`,
      inviteUrl,
      ``,
      `Este enlace expira en ${INVITATION_TTL_HOURS} horas.`,
      ``,
      `Si no esperabas esta invitacion, puedes ignorar este correo.`,
    ].join("\n"),
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: "TENANT_ADMIN",
    action: "invitation.create",
    entity: "UserInvitation",
    after: { email: normalizedEmail, role },
  });

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
  const { user, tenant } = await requireTenantRole(tenantSlug, [
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
    actorRole: "TENANT_ADMIN",
    action: "invitation.revoke",
    entity: "UserInvitation",
    entityId: invitationId,
    after: { email: invitation.email },
  });

  return { ok: true };
}
