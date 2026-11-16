import { randomBytes } from "node:crypto";
import { SERVICE_TYPE_TEMPLATES, templateToCreateData } from "../../../src/lib/catalog/service-type-templates";
import type { Db } from "./db";

/**
 * Tenants descartables para las pruebas con base real. Prefijo `zz-db-`: no choca con los tenants del seed ni con
 * los `zz-e2e-` de Playwright, y `sweepStaleTestTenants` limpia los que dejó una corrida interrumpida.
 * `isDemo: false` a propósito: `e2e:cleanup` actúa sobre los demo y no debe tocar estos datos a mitad de prueba.
 */
export const TEST_TENANT_PREFIX = "zz-db-";

export type PlanCode = "DEMO" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

export type TestTenant = { id: string; slug: string; planCode: PlanCode };

export async function createTestTenant(db: Db, options: { planCode?: PlanCode } = {}): Promise<TestTenant> {
  const planCode = options.planCode ?? "STARTER";
  const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: planCode } });
  const slug = `${TEST_TENANT_PREFIX}${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const tenant = await db.tenant.create({
    data: {
      name: `ZZ DB ${slug}`,
      legalName: `ZZ DB ${slug} SA`,
      slug,
      planId: plan.id,
      status: "ACTIVE",
      isDemo: false,
      activatedAt: new Date(),
    },
  });
  return { id: tenant.id, slug, planCode };
}

/** Borra el tenant y todo lo que cuelga de él, respetando las claves foráneas sin cascada (viajes → solicitudes). */
export async function destroyTestTenant(db: Db, tenantId: string): Promise<void> {
  await db.tripAssignment.deleteMany({ where: { tenantId } });
  await db.trip.deleteMany({ where: { tenantId } });
  await db.serviceRequest.deleteMany({ where: { tenantId } });
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.customerMembership.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
}

/** Dominio reservado de los usuarios descartables: `sweepStaleTestTenants` los limpia si una corrida se interrumpe. */
export const TEST_USER_DOMAIN = "@zz-db.local";

/** Usuario sin credenciales utilizables (el hash no es válido): solo sirve para colgar membresías de portal. */
export async function createTestUser(db: Db, label: string): Promise<{ id: string; email: string }> {
  const email = `${label}-${randomBytes(4).toString("hex")}${TEST_USER_DOMAIN}`;
  const user = await db.user.create({ data: { name: `Usuario ${label}`, email, passwordHash: "!", emailVerified: true } });
  return { id: user.id, email };
}

/** Borra usuarios descartables (sus membresías de portal caen en cascada). */
export async function destroyTestUsers(db: Db, ids: string[]): Promise<void> {
  if (ids.length > 0) await db.user.deleteMany({ where: { id: { in: ids } } });
}

/** Elimina los tenants `zz-db-*` y usuarios descartables que quedaron de una corrida interrumpida (al empezar cada archivo). */
export async function sweepStaleTestTenants(db: Db): Promise<number> {
  const stale = await db.tenant.findMany({ where: { slug: { startsWith: TEST_TENANT_PREFIX } }, select: { id: true } });
  for (const { id } of stale) await destroyTestTenant(db, id);
  await db.user.deleteMany({ where: { email: { endsWith: TEST_USER_DOMAIN } } });
  return stale.length;
}

export type TenantBasics = { customerId: string; serviceTypeId: string };

/** Un cliente y un tipo de servicio: lo mínimo que exigen las solicitudes y los viajes. */
export async function createBasics(db: Db, tenantId: string): Promise<TenantBasics> {
  const customer = await db.customerAccount.create({ data: { tenantId, code: "CLI-BASE", name: "Cliente base" } });
  const [template] = SERVICE_TYPE_TEMPLATES;
  const serviceType = await db.serviceType.create({ data: templateToCreateData(template, tenantId) });
  return { customerId: customer.id, serviceTypeId: serviceType.id };
}

/** Inserta `count` vehículos `<prefix>-1…` (placa y código propios) de golpe. */
export async function seedVehicles(db: Db, tenantId: string, count: number, prefix = "VEH"): Promise<void> {
  await db.vehicle.createMany({
    data: Array.from({ length: count }, (_, i) => ({ tenantId, code: `${prefix}-${i + 1}`, plate: `${prefix}-P${i + 1}`, type: "CAMION" })),
  });
}

/** Inserta `count` clientes `<prefix>-1…` de golpe. */
export async function seedCustomers(db: Db, tenantId: string, count: number, prefix = "SEED"): Promise<void> {
  await db.customerAccount.createMany({
    data: Array.from({ length: count }, (_, i) => ({ tenantId, code: `${prefix}-${i + 1}`, name: `Cliente ${prefix} ${i + 1}` })),
  });
}
