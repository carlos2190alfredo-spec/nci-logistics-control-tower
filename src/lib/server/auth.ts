import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CustomerRole, PlatformRole, TenantRole } from "@/generated/prisma";
import { createOpaqueToken, hashToken, keyedHash, verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { logger } from "@/lib/server/logger";

export type AuthLevel = "PASSWORD_ONLY" | "MFA_VERIFIED" | "PARTIAL_MFA_PENDING";

const MFA_REQUIRED_PLATFORM_ROLES: PlatformRole[] = ["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"];
const MFA_REQUIRED_TENANT_ROLES: TenantRole[] = ["TENANT_OWNER", "TENANT_ADMIN"];

const SESSION_DAYS = 7;

export const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "nci_lct_session";

function truncateUserAgent(input: string | null) {
  if (!input) return null;
  return input.slice(0, 200);
}

async function collectRequestMetadata() {
  try {
    const store = await headers();
    const rawIp = store.get("x-forwarded-for")?.split(",")[0]?.trim() ?? store.get("x-real-ip") ?? "local";
    return {
      userAgent: truncateUserAgent(store.get("user-agent")),
      ipHash: keyedHash(rawIp, "session-ip"),
    };
  } catch {
    return { userAgent: null, ipHash: null };
  }
}

/**
 * Inicia sesión: verifica credenciales, revoca la sesión asociada al token
 * previo (si venía) — cierra el navegador que hacia login contra reuso — y
 * crea una nueva sesión con userAgent + ipHash truncados. Nunca revela si el
 * usuario existe: el llamador aplica delay constante.
 */
export async function signIn(email: string, password: string): Promise<{ ok: true; mfaRequired: boolean } | { ok: false; message: string }> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { mfaSecret: true },
  });

  if (!user || !user.active) return { ok: false, message: "Credenciales invalidas." };

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    return { ok: false, message: "Credenciales invalidas." };
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(sessionCookieName)?.value;
  if (previousToken) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(previousToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const mfaActive = user.mfaSecret?.verified === true;
  const authLevel: AuthLevel = mfaActive ? "PARTIAL_MFA_PENDING" : "PASSWORD_ONLY";

  const token = createOpaqueToken();
  const expiresAt = mfaActive
    ? new Date(Date.now() + 15 * 60 * 1000)
    : new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { userAgent, ipHash } = await collectRequestMetadata();

  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent,
      ipHash,
      lastSeenAt: new Date(),
      authLevel,
    },
  });
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lastLoginAt: new Date() },
  });
  await audit({
    actorId: user.id,
    actorRole: user.platformRole ?? "USER",
    action: "auth.login",
    entity: "Session",
    entityId: session.id,
    after: mfaActive ? { mfaRequired: true } : undefined,
  });

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return { ok: true, mfaRequired: mfaActive };
}

export async function signOut() {
  const session = await getSession();
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await getDb().session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (session) {
    await audit({
      actorId: session.user.id,
      actorRole: session.user.platformRole ?? "USER",
      action: "auth.logout",
      entity: "Session",
      entityId: session.id,
    });
  }

  cookieStore.delete(sessionCookieName);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const db = getDb();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          tenantMemberships: { where: { active: true }, include: { tenant: true } },
          customerMemberships: { where: { active: true }, include: { customerAccount: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }

  // Actualiza `lastSeenAt` con throttle ligero (una escritura por minuto máximo).
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 60_000) {
    void db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch((error) => logger.warn("session last-seen update failed", { error: error instanceof Error ? error.message : "unknown" }));
  }

  return session;
}

export async function requireAuthenticatedUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.authLevel === "PARTIAL_MFA_PENDING") redirect("/mfa/verify");
  return session.user;
}

export async function getPartialSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const db = getDb();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }

  return session;
}

export async function promoteSessionToMfaVerified(sessionId: string) {
  const db = getDb();
  await db.session.update({
    where: { id: sessionId },
    data: {
      authLevel: "MFA_VERIFIED",
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
}

/** Devuelve la sesión activa completa o null (para la UI de gestión). */
export async function getCurrentSession() {
  return getSession();
}

export async function requirePlatformRole(roles: PlatformRole[]) {
  const user = await requireAuthenticatedUser();
  if (!user.platformRole || !roles.includes(user.platformRole)) redirect("/login");

  if (MFA_REQUIRED_PLATFORM_ROLES.includes(user.platformRole)) {
    const mfaSecret = await getDb().userMfaSecret.findUnique({ where: { userId: user.id } });
    if (!mfaSecret?.verified) redirect("/account/security/mfa/setup");
  }

  return user;
}

export async function resolveActiveTenant(tenantSlug: string) {
  const tenant = await getDb().tenant.findUnique({
    where: { slug: tenantSlug },
    include: { branding: true, settings: true, plan: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") return null;
  return tenant;
}

export async function requireTenantMembership(tenantSlug: string) {
  const user = await requireAuthenticatedUser();
  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) redirect("/login");

  const membership = await getDb().tenantMembership.findFirst({
    where: { tenantId: tenant.id, userId: user.id, active: true },
  });

  if (!membership) redirect("/login");

  return { user, tenant, membership };
}

export async function requireTenantRole(tenantSlug: string, roles: TenantRole[]) {
  const context = await requireTenantMembership(tenantSlug);
  if (!roles.includes(context.membership.role)) redirect(`/t/${tenantSlug}`);

  if (MFA_REQUIRED_TENANT_ROLES.includes(context.membership.role)) {
    const mfaSecret = await getDb().userMfaSecret.findUnique({ where: { userId: context.user.id } });
    if (!mfaSecret?.verified) redirect("/account/security/mfa/setup");
  }

  return context;
}

export async function requireCustomerMembership(tenantSlug: string, roles?: CustomerRole[]) {
  const user = await requireAuthenticatedUser();
  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) redirect("/login");

  const membership = await getDb().customerMembership.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      active: true,
      role: roles ? { in: roles } : undefined,
    },
    include: { customerAccount: true },
  });

  if (!membership) redirect(`/t/${tenantSlug}`);

  return { user, tenant, membership, customerAccount: membership.customerAccount };
}

export async function assertTenantEntityAccess(tenantId: string, entityTenantId?: string | null) {
  if (!entityTenantId || entityTenantId !== tenantId) {
    return false;
  }

  return true;
}

export async function assertCustomerEntityAccess(
  tenantId: string,
  customerAccountId: string,
  entity: { tenantId?: string | null; customerAccountId?: string | null },
) {
  return entity.tenantId === tenantId && entity.customerAccountId === customerAccountId;
}

/**
 * Revoca todas las sesiones activas del usuario. Se llama desde:
 * - cambio o reset de contraseña,
 * - acción "cerrar todas las sesiones" de la UI de gestión.
 */
export async function revokeAllUserSessions(userId: string, reason: string) {
  const db = getDb();
  const now = new Date();
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "auth.sessions.revoke_all",
    entity: "User",
    entityId: userId,
    after: { reason, revokedCount: result.count },
  });
  return result.count;
}

/** Revoca una sesión específica del usuario. Sin filtración cross-user. */
export async function revokeSessionById(userId: string, sessionId: string) {
  const db = getDb();
  const result = await db.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) {
    await audit({
      actorId: userId,
      actorRole: "USER",
      action: "auth.sessions.revoke_one",
      entity: "Session",
      entityId: sessionId,
    });
  }
  return result.count > 0;
}

export async function requiresMfaForRole(userId: string): Promise<boolean> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { tenantMemberships: { where: { active: true } } },
  });
  if (!user) return false;

  if (user.platformRole && MFA_REQUIRED_PLATFORM_ROLES.includes(user.platformRole)) return true;

  for (const membership of user.tenantMemberships) {
    if (MFA_REQUIRED_TENANT_ROLES.includes(membership.role)) return true;
  }
  return false;
}

/** Revoca todas las sesiones del usuario EXCEPTO la del token actual. */
export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const db = getDb();
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null, id: { not: currentSessionId } },
    data: { revokedAt: new Date() },
  });
  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "auth.sessions.revoke_others",
    entity: "User",
    entityId: userId,
    after: { revokedCount: result.count },
  });
  return result.count;
}
