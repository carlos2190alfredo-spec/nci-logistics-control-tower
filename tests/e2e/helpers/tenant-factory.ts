import argon2 from "argon2";
import type { PrismaClient } from "../../../src/generated/prisma";
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
  return { id: tenant.id, slug, name: tenant.name, ops: { id: ops.id, email: ops.email, password: OPS_PASSWORD } };
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
  const users = await db.user.findMany({ where: { email: { endsWith: "@e2e.local" }, id: tenant.ops.id }, select: { id: true } });
  for (const user of users) {
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}
