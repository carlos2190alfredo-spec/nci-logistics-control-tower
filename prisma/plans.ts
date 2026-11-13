import type {
  PrismaClient,
  TenantPlan,
  TenantPlanCode,
} from "../src/generated/prisma";

/**
 * Definición única de los planes de tenant (OPS-03).
 *
 * Ninguna migración inserta filas en `tenant_plans`: existen porque las upserta el seed
 * (`prisma/seed.ts`) o el bootstrap de producción (`scripts/bootstrap-production.ts`).
 * Ambos importan este módulo, así que no pueden desviarse. Crear un tenant desde la UI
 * falla en una base sin planes (`findUniqueOrThrow` en `tenant-actions.ts`).
 */
export type TenantPlanDefinition = {
  code: TenantPlanCode;
  name: string;
  maxUsers: number;
  maxDrivers: number;
  maxVehicles: number;
  maxCustomers: number;
  maxDocuments: number;
  integrationsEnabled?: boolean;
};

export const TENANT_PLANS: readonly TenantPlanDefinition[] = [
  {
    code: "DEMO",
    name: "Demo",
    maxUsers: 5,
    maxDrivers: 5,
    maxVehicles: 5,
    maxCustomers: 3,
    maxDocuments: 50,
  },
  {
    code: "STARTER",
    name: "Starter",
    maxUsers: 12,
    maxDrivers: 10,
    maxVehicles: 10,
    maxCustomers: 6,
    maxDocuments: 250,
  },
  {
    code: "PROFESSIONAL",
    name: "Professional",
    maxUsers: 40,
    maxDrivers: 50,
    maxVehicles: 50,
    maxCustomers: 30,
    maxDocuments: 2500,
    integrationsEnabled: true,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    maxUsers: 200,
    maxDrivers: 400,
    maxVehicles: 400,
    maxCustomers: 200,
    maxDocuments: 25000,
    integrationsEnabled: true,
  },
];

const COMPARED_FIELDS = [
  "name",
  "maxUsers",
  "maxDrivers",
  "maxVehicles",
  "maxCustomers",
  "maxDocuments",
  "integrationsEnabled",
] as const;

/**
 * Campos de una fila existente que difieren de la definición. Una fila existente nunca se
 * modifica (los límites de un plan en uso no cambian en silencio); la diferencia solo se informa.
 */
export function planDrift(
  definition: TenantPlanDefinition,
  row: Pick<TenantPlan, (typeof COMPARED_FIELDS)[number]>,
): string[] {
  return COMPARED_FIELDS.filter((field) => {
    const expected =
      field === "integrationsEnabled"
        ? (definition.integrationsEnabled ?? false)
        : definition[field];
    return row[field] !== expected;
  });
}

/** Crea los planes que falten y deja intactos los existentes. Idempotente. */
export async function upsertTenantPlans(
  db: Pick<PrismaClient, "tenantPlan">,
): Promise<Record<TenantPlanCode, TenantPlan>> {
  const plans: Partial<Record<TenantPlanCode, TenantPlan>> = {};
  for (const { code, ...data } of TENANT_PLANS) {
    plans[code] = await db.tenantPlan.upsert({
      where: { code },
      update: {},
      create: { code, ...data },
    });
  }
  return plans as Record<TenantPlanCode, TenantPlan>;
}
