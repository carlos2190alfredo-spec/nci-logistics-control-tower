import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertWithinPlanLimit, getPlanUsage, PlanLimitError, planLimitMessage } from "@/lib/server/plan-limits";
import { connectTestDb } from "./helpers/db";
import {
  createTestTenant,
  destroyTestTenant,
  seedCustomers,
  seedVehicles,
  sweepStaleTestTenants,
  type TestTenant,
} from "./helpers/tenants";

/**
 * Límites del plan contra PostgreSQL real (ADR-038). Se usa el plan DEMO sembrado (5 vehículos, 3 clientes): no se
 * modifica ningún plan, solo se llena el tenant descartable hasta el borde.
 */
const db = connectTestDb();

let demoVehicles: number;
let demoCustomers: number;
let demoName: string;
const tenants: TestTenant[] = [];

async function freshTenant(): Promise<TestTenant> {
  const tenant = await createTestTenant(db, { planCode: "DEMO" });
  tenants.push(tenant);
  return tenant;
}

/** Lo que hace la acción real: bloquear + verificar + insertar, todo en una transacción. */
function addVehicle(tenant: TestTenant, label: string) {
  return db.$transaction(
    async (tx) => {
      await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "vehicles", adding: 1 });
      return tx.vehicle.create({ data: { tenantId: tenant.id, code: label, plate: `${label}-P`, type: "CAMION" } });
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}

function addCustomer(tenant: TestTenant, label: string) {
  return db.$transaction(
    async (tx) => {
      await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "customers", adding: 1 });
      return tx.customerAccount.create({ data: { tenantId: tenant.id, code: label, name: `Cliente ${label}` } });
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}

function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: "DEMO" } });
  demoVehicles = plan.maxVehicles;
  demoCustomers = plan.maxCustomers;
  demoName = plan.name;
  // Las pruebas de borde necesitan cupos pequeños: si alguien sube el plan DEMO, que falle aquí con un motivo claro.
  expect(demoVehicles).toBeLessThanOrEqual(10);
  expect(demoCustomers).toBeLessThanOrEqual(10);
});

afterAll(async () => {
  for (const tenant of tenants) await destroyTestTenant(db, tenant.id);
  await db.$disconnect();
});

describe("getPlanUsage", () => {
  it("lee el plan real y cuenta solo activos para clientes y vehículos", async () => {
    const tenant = await freshTenant();
    await seedVehicles(db, tenant.id, 3);
    await db.vehicle.updateMany({ where: { tenantId: tenant.id, code: "VEH-3" }, data: { status: "INACTIVE" } });
    await seedCustomers(db, tenant.id, 2);
    await db.customerAccount.updateMany({ where: { tenantId: tenant.id, code: "SEED-2" }, data: { active: false } });

    const { plan, usage } = await getPlanUsage(db, tenant.id);
    expect(plan.code).toBe("DEMO");
    expect(plan.maxVehicles).toBe(demoVehicles);
    expect(plan.maxCustomers).toBe(demoCustomers);
    expect(usage.vehicles).toBe(2);
    expect(usage.customers).toBe(1);
  });
});

describe("assertWithinPlanLimit", () => {
  it("permite llegar exactamente al tope y rechaza el siguiente con PlanLimitError completo", async () => {
    const tenant = await freshTenant();
    await seedVehicles(db, tenant.id, demoVehicles - 1);

    await expect(addVehicle(tenant, "ULTIMO")).resolves.toBeTruthy();
    expect(await db.vehicle.count({ where: { tenantId: tenant.id } })).toBe(demoVehicles);

    const error = await rejection(addVehicle(tenant, "SOBRA"));
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ resource: "vehicles", max: demoVehicles, used: demoVehicles, adding: 1, planName: demoName });
    expect((error as PlanLimitError).message).toContain(`permite hasta ${demoVehicles} vehículos`);
    // La transacción se revirtió: el vehículo que sobraba no existe.
    expect(await db.vehicle.count({ where: { tenantId: tenant.id } })).toBe(demoVehicles);
    expect(await db.vehicle.count({ where: { tenantId: tenant.id, code: "SOBRA" } })).toBe(0);
  });

  it("un lote que no cabe se rechaza completo, con el mensaje de importación", async () => {
    const tenant = await freshTenant();
    await seedCustomers(db, tenant.id, demoCustomers - 1);

    const error = await rejection(
      db.$transaction((tx) => assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "customers", adding: 2 })),
    );
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ resource: "customers", max: demoCustomers, used: demoCustomers - 1, adding: 2 });
    expect(planLimitMessage(error as PlanLimitError, "import")).toContain("No se importó nada.");
    // Cabe exactamente 1.
    await expect(db.$transaction((tx) => assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "customers", adding: 1 }))).resolves.toBeUndefined();
  });

  it("inactivar libera cupo (vehículos con INACTIVE y clientes con active=false no cuentan)", async () => {
    const tenant = await freshTenant();
    await seedVehicles(db, tenant.id, demoVehicles);
    await seedCustomers(db, tenant.id, demoCustomers);
    expect(await rejection(addVehicle(tenant, "A"))).toBeInstanceOf(PlanLimitError);
    expect(await rejection(addCustomer(tenant, "A"))).toBeInstanceOf(PlanLimitError);

    await db.vehicle.updateMany({ where: { tenantId: tenant.id, code: "VEH-1" }, data: { status: "INACTIVE" } });
    await db.customerAccount.updateMany({ where: { tenantId: tenant.id, code: "SEED-1" }, data: { active: false } });
    await expect(addVehicle(tenant, "A")).resolves.toBeTruthy();
    await expect(addCustomer(tenant, "A")).resolves.toBeTruthy();
    // Y vuelve a estar lleno.
    expect(await rejection(addVehicle(tenant, "B"))).toBeInstanceOf(PlanLimitError);
    expect(await rejection(addCustomer(tenant, "B"))).toBeInstanceOf(PlanLimitError);
  });

  it("los registros de otra empresa no cuentan", async () => {
    const full = await freshTenant();
    const empty = await freshTenant();
    await seedVehicles(db, full.id, demoVehicles);
    await expect(addVehicle(empty, "LIBRE")).resolves.toBeTruthy();
    expect(await rejection(addVehicle(full, "SOBRA"))).toBeInstanceOf(PlanLimitError);
  });

  it("un tenant que ya está por encima del tope (bajó de plan) no puede agregar, pero sigue leyéndose", async () => {
    const tenant = await freshTenant();
    await seedVehicles(db, tenant.id, demoVehicles + 2);
    const error = await rejection(addVehicle(tenant, "MAS"));
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ used: demoVehicles + 2, max: demoVehicles });
    const { usage } = await getPlanUsage(db, tenant.id);
    expect(usage.vehicles).toBe(demoVehicles + 2);
  });

  it("carrera: con un solo cupo libre y 6 altas simultáneas, entra exactamente una", async () => {
    const tenant = await freshTenant();
    await seedVehicles(db, tenant.id, demoVehicles - 1);

    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => addVehicle(tenant, `RACE-${i}`)));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(PlanLimitError);
    expect(await db.vehicle.count({ where: { tenantId: tenant.id } })).toBe(demoVehicles);
  });

  it("carrera de clientes: dos cupos libres y 7 altas simultáneas, entran exactamente dos", async () => {
    const tenant = await freshTenant();
    await seedCustomers(db, tenant.id, demoCustomers - 2);

    const results = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => addCustomer(tenant, `RACE-${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
    expect(await db.customerAccount.count({ where: { tenantId: tenant.id, active: true } })).toBe(demoCustomers);
  });

  it("lee el plan DENTRO del bloqueo: un cambio de plan concurrente se ve en la decisión", async () => {
    const tenant = await freshTenant();
    const starter = await db.tenantPlan.findFirstOrThrow({ where: { code: "STARTER" } });
    await seedVehicles(db, tenant.id, demoVehicles);
    // Con el plan DEMO está lleno…
    expect(await rejection(addVehicle(tenant, "A"))).toBeInstanceOf(PlanLimitError);
    // …y al pasar a un plan mayor la siguiente alta ya cabe (sin caché del plan).
    await db.tenant.update({ where: { id: tenant.id }, data: { planId: starter.id } });
    await expect(addVehicle(tenant, "B")).resolves.toBeTruthy();
    const { plan } = await getPlanUsage(db, tenant.id);
    expect(plan.code).toBe("STARTER");
  });
});
