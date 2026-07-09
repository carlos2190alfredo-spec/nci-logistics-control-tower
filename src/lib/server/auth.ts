import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CustomerRole, PlatformRole, TenantRole } from "@/generated/prisma/enums";
import { createOpaqueToken, hashToken, verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

const SESSION_DAYS = 7;

export const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "nci_lct_session";

export async function signIn(email: string, password: string) {
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !user.active) return { ok: false, message: "Credenciales invalidas." };

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    return { ok: false, message: "Credenciales invalidas." };
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
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
    entity: "User",
    entityId: user.id,
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return { ok: true };
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
      entity: "User",
      entityId: session.user.id,
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

  return session;
}

export async function requireAuthenticatedUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function requirePlatformRole(roles: PlatformRole[]) {
  const user = await requireAuthenticatedUser();
  if (!user.platformRole || !roles.includes(user.platformRole)) redirect("/login");
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
