import { describe, expect, it, vi } from "vitest";
import {
  planDrift,
  TENANT_PLANS,
  upsertTenantPlans,
  type TenantPlanDefinition,
} from "../../prisma/plans";

describe("TENANT_PLANS", () => {
  it("define los cuatro planes del enum TenantPlanCode, sin repetir", () => {
    expect(TENANT_PLANS.map((plan) => plan.code).sort()).toEqual([
      "DEMO",
      "ENTERPRISE",
      "PROFESSIONAL",
      "STARTER",
    ]);
  });

  // Los valores sembrados en staging y en produccion deben ser estos: un cambio aqui es una
  // decision de producto consciente, no un efecto colateral.
  it("conserva los limites con los que se sembraron las bases existentes", () => {
    const byCode = Object.fromEntries(
      TENANT_PLANS.map((plan) => [plan.code, plan]),
    );
    expect(byCode.DEMO).toMatchObject({
      maxUsers: 5,
      maxDrivers: 5,
      maxVehicles: 5,
      maxCustomers: 3,
      maxDocuments: 50,
    });
    expect(byCode.STARTER).toMatchObject({
      maxUsers: 12,
      maxDrivers: 10,
      maxVehicles: 10,
      maxCustomers: 6,
      maxDocuments: 250,
    });
    expect(byCode.PROFESSIONAL).toMatchObject({
      maxUsers: 40,
      maxDrivers: 50,
      maxVehicles: 50,
      maxCustomers: 30,
      maxDocuments: 2500,
      integrationsEnabled: true,
    });
    expect(byCode.ENTERPRISE).toMatchObject({
      maxUsers: 200,
      maxDrivers: 400,
      maxVehicles: 400,
      maxCustomers: 200,
      maxDocuments: 25000,
      integrationsEnabled: true,
    });
    expect(byCode.DEMO.integrationsEnabled).toBeUndefined();
    expect(byCode.STARTER.integrationsEnabled).toBeUndefined();
  });
});

describe("upsertTenantPlans", () => {
  it("hace upsert de cada plan sin modificar los existentes (update vacio)", async () => {
    const upsert = vi.fn(
      async ({ create }: { create: TenantPlanDefinition }) => ({
        id: `id-${create.code}`,
        ...create,
      }),
    );
    const plans = await upsertTenantPlans({ tenantPlan: { upsert } } as never);

    expect(upsert).toHaveBeenCalledTimes(TENANT_PLANS.length);
    for (const call of upsert.mock.calls as unknown as [
      { where: unknown; update: unknown; create: TenantPlanDefinition },
    ][]) {
      expect(call[0].update).toEqual({});
      expect(call[0].where).toEqual({ code: call[0].create.code });
    }
    expect(Object.keys(plans).sort()).toEqual([
      "DEMO",
      "ENTERPRISE",
      "PROFESSIONAL",
      "STARTER",
    ]);
    expect(plans.STARTER).toMatchObject({ id: "id-STARTER", code: "STARTER" });
  });
});

describe("planDrift", () => {
  const starter = TENANT_PLANS.find((plan) => plan.code === "STARTER")!;
  const row = {
    name: "Starter",
    maxUsers: 12,
    maxDrivers: 10,
    maxVehicles: 10,
    maxCustomers: 6,
    maxDocuments: 250,
    integrationsEnabled: false,
  };

  it("no informa diferencias cuando la fila coincide (integrationsEnabled ausente = false)", () => {
    expect(planDrift(starter, row)).toEqual([]);
  });

  it("lista los campos que difieren", () => {
    expect(
      planDrift(starter, { ...row, maxUsers: 99, integrationsEnabled: true }),
    ).toEqual(["maxUsers", "integrationsEnabled"]);
  });
});
