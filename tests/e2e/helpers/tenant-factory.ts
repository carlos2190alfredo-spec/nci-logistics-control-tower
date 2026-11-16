import argon2 from "argon2";
import { encryptSecret } from "../../../src/lib/server/mfa-crypto";
import { SEED_TOTP_SECRET } from "./auth";
import type { PrismaClient, TenantRole } from "../../../src/generated/prisma";
import { SERVICE_TYPE_TEMPLATES, templateToCreateData } from "../../../src/lib/catalog/service-type-templates";

/**
 * Tenant descartable para E2E (ADR-038): nunca se escribe en los tenants demo. Nombre y slug no contienen las
 * subcadenas de los tenants del seed ("Panatruck Demo", "TransLogistica Demo") para no chocar con sus specs.
 */
export type ThrowawayTenant = {
  id: string;
  slug: string;
  name: string;
  ops: { id: string; email: string; password: string };
  /** Propietario con MFA verificado (el helper `login` completa el TOTP del seed). */
  owner: { id: string; email: string; password: string };
  stamp: string;
};

const OPS_PASSWORD = "Ops-E2E-2026-Throwaway!";

export async function createThrowawayTenant(
  db: PrismaClient,
  options: { planCode?: "DEMO" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE"; withServiceTypes?: boolean } = {},
): Promise<ThrowawayTenant> {
  const stamp = `${Date.now()}`;
  const slug = `zz-e2e-${stamp}`;
  const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: options.planCode ?? "PROFESSIONAL" } });
  const tenant = await db.tenant.create({
    data: {
      name: `ZZ E2E ${stamp} Transportes`,
      legalName: `ZZ E2E ${stamp} SA`,
      slug,
      planId: plan.id,
      status: "ACTIVE",
      isDemo: true,
      activatedAt: new Date(),
      branding: { create: { wordmark: `ZZ E2E ${stamp}` } },
      settings: { create: {} },
      features: {
        create: [
          { key: "portal", enabled: true },
          { key: "driver_app", enabled: true },
          { key: "notifications", enabled: true },
          { key: "reports", enabled: true },
          { key: "integrations", enabled: false },
        ],
      },
    },
  });
  if (options.withServiceTypes !== false) {
    await db.serviceType.createMany({ data: SERVICE_TYPE_TEMPLATES.map((template) => templateToCreateData(template, tenant.id)) });
  }
  const ops = await db.user.create({
    data: {
      name: "Operaciones E2E",
      email: `ops-${stamp}@e2e.local`,
      passwordHash: await argon2.hash(OPS_PASSWORD, { type: argon2.argon2id }),
      emailVerified: true,
    },
  });
  await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: ops.id, role: "OPERATIONS_MANAGER" } });
  const owner = await db.user.create({
    data: {
      name: "Propietario E2E",
      email: `owner-${stamp}@e2e.local`,
      passwordHash: await argon2.hash(OPS_PASSWORD, { type: argon2.argon2id }),
      emailVerified: true,
    },
  });
  const mfa = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.create({
    data: { userId: owner.id, encryptedSecret: mfa.encrypted, iv: mfa.iv, authTag: mfa.authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });
  await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: owner.id, role: "TENANT_OWNER" } });
  return {
    id: tenant.id,
    slug,
    name: tenant.name,
    stamp,
    ops: { id: ops.id, email: ops.email, password: OPS_PASSWORD },
    owner: { id: owner.id, email: owner.email, password: OPS_PASSWORD },
  };
}

/**
 * Miembro extra del tenant descartable con un rol concreto (despachador, conductor, seguridad…), sin MFA. Los roles que
 * exigen MFA (propietario y administrador) ya existen en `ThrowawayTenant.owner`. El correo termina en `@e2e.local` y
 * lleva el sello del tenant, así que `destroyThrowawayTenant` lo limpia.
 */
export async function createThrowawayMember(
  db: PrismaClient,
  tenant: ThrowawayTenant,
  role: Exclude<TenantRole, "TENANT_OWNER" | "TENANT_ADMIN">,
  label: string,
): Promise<{ id: string; email: string; password: string }> {
  const user = await db.user.create({
    data: {
      name: `${label} E2E`,
      email: `${label}-${tenant.stamp}@e2e.local`,
      passwordHash: await argon2.hash(OPS_PASSWORD, { type: argon2.argon2id }),
      emailVerified: true,
    },
  });
  await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
  return { id: user.id, email: user.email, password: OPS_PASSWORD };
}

/** Borra el tenant descartable y todo lo que cuelga de el, respetando las FK RESTRICT. */
export async function destroyThrowawayTenant(db: PrismaClient, tenant: ThrowawayTenant): Promise<void> {
  const tenantId = tenant.id;
  await db.tripAssignment.deleteMany({ where: { tenantId } });
  await db.trip.deleteMany({ where: { tenantId } });
  await db.serviceRequest.deleteMany({ where: { tenantId } });
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.customerMembership.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  // Usuarios de este tenant descartable (equipo y personas de portal creadas por la app): todos terminan en @e2e.local.
  const users = await db.user.findMany({ where: { email: { endsWith: "@e2e.local", contains: tenant.stamp } }, select: { id: true } });
  const ids = users.map((user) => user.id);
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
  await db.userMfaSecret.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
