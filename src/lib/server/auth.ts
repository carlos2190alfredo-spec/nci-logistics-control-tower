import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CustomerRole, PlatformRole, TenantMembership, TenantRole } from "@/generated/prisma";
import { createOpaqueToken, hashToken, keyedHash, verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { logger } from "@/lib/server/logger";
import {
  MFA_REQUIRED_TENANT_ROLES,
  evaluateTenantAccess,
  getRolesForPermission,
  tenantAccessRedirect,
  type TenantAccessDenialReason,
  type TenantPermission,
} from "@/lib/server/tenant-permissions";

export type AuthLevel = "PASSWORD_ONLY" | "MFA_VERIFIED" | "PARTIAL_MFA_PENDING";

const MFA_REQUIRED_PLATFORM_ROLES: PlatformRole[] = ["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"];

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
  } catch (error) {
    // Fuera de local keyedHash exige SESSION_METADATA_KEY: si falta, el metadato se omite
    // (no se bloquea el login) pero queda en el log para que la mala configuracion se vea.
    logger.error("session metadata unavailable", {
      service: "auth",
      outcome: "DEGRADED",
      reason: error instanceof Error ? error.message : "unknown",
    });
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

/**
 * Usuario de la sesion completa para endpoints API: devuelve null (el llamador
 * responde 401 JSON) cuando no hay sesion o el MFA sigue pendiente, en lugar de
 * la redireccion HTML que `requireAuthenticatedUser` emite para paginas.
 */
export async function getApiSessionUser() {
  const session = await getSession();
  if (!session || session.authLevel === "PARTIAL_MFA_PENDING") return null;
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

/**
 * Resuelve `user + tenant` para cualquier usuario con vínculo activo al
 * tenant — sea `tenantMembership` (operaciones/owner) o `customerMembership`
 * (portal cliente). Pensado para layouts compartidos que no necesitan el rol
 * específico. Página que sí lo necesita debe usar `requireTenantMembership`
 * o `requireCustomerMembership` directamente.
 */
export async function requireTenantAccess(tenantSlug: string) {
  const user = await requireAuthenticatedUser();
  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) redirect("/login");

  const db = getDb();
  const [tenantMembership, customerMembership] = await Promise.all([
    db.tenantMembership.findFirst({
      where: { tenantId: tenant.id, userId: user.id, active: true },
    }),
    db.customerMembership.findFirst({
      where: { tenantId: tenant.id, userId: user.id, active: true },
    }),
  ]);

  if (!tenantMembership && !customerMembership) redirect("/login");

  return { user, tenant };
}

export type TenantAccessResult =
  | {
      ok: true;
      tenant: NonNullable<Awaited<ReturnType<typeof resolveActiveTenant>>>;
      membership: TenantMembership;
    }
  | { ok: false; reason: TenantAccessDenialReason; role: TenantRole | null };

/**
 * Nucleo de acceso a un tenant, sin redirecciones: resuelve el tenant desde el
 * slug de la ruta (debe estar ACTIVE), la membresia activa del usuario ya
 * autenticado y, para los roles que lo exigen, el MFA verificado. Nunca usa un
 * identificador de tenant enviado por el navegador.
 *
 * `requireTenantRole` (paginas, redirige) y los endpoints API (responden 403)
 * comparten esta regla para no divergir.
 */
export async function resolveTenantAccess(
  userId: string,
  tenantSlug: string,
  allowedRoles?: readonly TenantRole[],
): Promise<TenantAccessResult> {
  const db = getDb();
  const tenant = await resolveActiveTenant(tenantSlug);
  if (!tenant) return { ok: false, reason: "TENANT_INACTIVE", role: null };

  const membership = await db.tenantMembership.findFirst({
    where: { tenantId: tenant.id, userId, active: true },
  });
  const hasCustomerMembership = membership
    ? false
    : (await db.customerMembership.findFirst({
        where: { tenantId: tenant.id, userId, active: true },
        select: { id: true },
      })) !== null;
  const mfaVerified =
    membership && MFA_REQUIRED_TENANT_ROLES.includes(membership.role)
      ? (await db.userMfaSecret.findUnique({ where: { userId } }))?.verified === true
      : false;

  const decision = evaluateTenantAccess({
    tenantActive: true,
    role: membership?.role ?? null,
    hasCustomerMembership,
    allowedRoles,
    mfaVerified,
  });
  // `!membership` con decision.ok es inalcanzable (la regla exige rol), pero se
  // falla cerrado para que el tipo garantice la membresia al llamador.
  if (!decision.ok || !membership) {
    return { ok: false, reason: decision.ok ? "NO_MEMBERSHIP" : decision.reason, role: membership?.role ?? null };
  }
  return { ok: true, tenant, membership };
}

export async function requireTenantRole(tenantSlug: string, roles: TenantRole[]) {
  const user = await requireAuthenticatedUser();
  const access = await resolveTenantAccess(user.id, tenantSlug, roles);
  if (!access.ok) redirect(tenantAccessRedirect(access.reason, tenantSlug, access.role));
  return { user, tenant: access.tenant, membership: access.membership };
}

/**
 * Exige que el rol del usuario tenga el permiso indicado en el mapa de
 * permisos (misma fuente que la navegacion). Un conductor que abre una vista
 * operativa por URL termina en su app, no en el centro de control.
 */
export async function requireTenantPermission(tenantSlug: string, permission: TenantPermission) {
  return requireTenantRole(tenantSlug, getRolesForPermission(permission));
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
