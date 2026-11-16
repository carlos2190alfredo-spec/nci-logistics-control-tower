import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({
  getDb: () => {
    throw new Error("getDb() no debe usarse dentro de la transaccion");
  },
}));

import {
  PlanLimitError,
  assertWithinPlanLimit,
  evaluatePlanLimit,
  getPlanUsage,
  planLimitMessage,
  planMaxFor,
  type PlanResource,
  type PlanUsageDb,
} from "./plan-limits";
import type { Tx } from "./trip-creation";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

const STARTER = {
  id: "plan-1",
  name: "Starter",
  code: "STARTER",
  maxUsers: 12,
  maxDrivers: 10,
  maxVehicles: 10,
  maxCustomers: 6,
  maxDocuments: 250,
  portalEnabled: true,
  integrationsEnabled: false,
};

type Counts = Partial<Record<PlanResource, number>>;

/** Base de datos falsa: registra el orden de las operaciones y los filtros de cada conteo. */
function fakeDb(options: { counts?: Counts; plan?: typeof STARTER | null; tenantMissing?: boolean } = {}) {
  const calls: string[] = [];
  const counts: Record<PlanResource, number> = {
    users: 0,
    drivers: 0,
    vehicles: 0,
    customers: 0,
    documents: 0,
    ...options.counts,
  };
  const count = (resource: PlanResource) =>
    vi.fn(async (_args: { where: Record<string, unknown> }) => {
      calls.push(`count:${resource}`);
      return counts[resource];
    });
  const raw = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      calls.push(`raw:${strings.join("?").includes("FOR NO KEY UPDATE") ? "lock" : "otro"}`);
      return [{ id: TENANT_ID }];
    }),
    tenant: {
      findUnique: vi.fn(async (_args: unknown) => {
        calls.push("plan");
        return options.tenantMissing ? null : { plan: options.plan ?? STARTER };
      }),
    },
    tenantMembership: { count: count("users") },
    driver: { count: count("drivers") },
    vehicle: { count: count("vehicles") },
    customerAccount: { count: count("customers") },
    document: { count: count("documents") },
  };
  return { db: raw as unknown as PlanUsageDb, tx: raw as unknown as Tx, raw, calls };
}

describe("evaluatePlanLimit (funcion pura)", () => {
  it.each([
    // [used, adding, max] -> ok, remaining
    [0, 1, 10, true, 10],
    [5, 1, 10, true, 5],
    [9, 1, 10, true, 1], // queda exactamente un cupo
    [10, 1, 10, false, 0], // ya esta en el tope
    [10, 0, 10, true, 0], // en el tope, sin agregar nada
    [6, 4, 10, true, 4], // llega exactamente al tope
    [6, 5, 10, false, 4], // se pasa por uno
    [4, 40, 6, false, 2], // importacion que no cabe
    [0, 0, 0, true, 0], // plan sin cupo y sin altas
    [0, 1, 0, false, 0], // plan sin cupo
    [12, 0, 10, false, 0], // ya excedido (bajo de plan): remaining nunca es negativo
    [12, 1, 10, false, 0],
  ])("used=%i adding=%i max=%i => ok=%s remaining=%i", (used, adding, max, ok, remaining) => {
    expect(evaluatePlanLimit({ used, adding, max })).toEqual({ ok, remaining });
  });

  it.each([
    [{ used: -1, adding: 1, max: 10 }],
    [{ used: 1, adding: -1, max: 10 }],
    [{ used: 1, adding: 1, max: -1 }],
    [{ used: 1.5, adding: 1, max: 10 }],
    [{ used: 1, adding: 0.5, max: 10 }],
    [{ used: Number.NaN, adding: 1, max: 10 }],
    [{ used: 1, adding: Number.NaN, max: 10 }],
    [{ used: 1, adding: 1, max: Number.NaN }],
    [{ used: 1, adding: 1, max: Number.POSITIVE_INFINITY }],
  ])("falla cerrado con entradas que no son enteros no negativos: %j", (input) => {
    expect(evaluatePlanLimit(input)).toEqual({ ok: false, remaining: 0 });
  });
});

describe("planMaxFor", () => {
  it("elige el limite de cada recurso", () => {
    expect(planMaxFor(STARTER, "users")).toBe(12);
    expect(planMaxFor(STARTER, "drivers")).toBe(10);
    expect(planMaxFor(STARTER, "vehicles")).toBe(10);
    expect(planMaxFor(STARTER, "customers")).toBe(6);
    expect(planMaxFor(STARTER, "documents")).toBe(250);
  });
});

describe("planLimitMessage", () => {
  const vehicles = { resource: "vehicles", max: 10, used: 10, adding: 1, planName: "Starter" } as const;

  it("alta: causa y salida, con usted y ortografia completa", () => {
    expect(planLimitMessage(vehicles)).toBe(
      "Su plan Starter permite hasta 10 vehículos y ya tiene 10 registrados. Para agregar más, solicite ampliar el plan a NCI Automation.",
    );
    expect(planLimitMessage(vehicles, "create")).toBe(planLimitMessage(vehicles));
  });

  it("importacion: dice cuanto agregaria, cuanto admite y que no se importo nada", () => {
    expect(planLimitMessage({ resource: "customers", max: 6, used: 4, adding: 40, planName: "Starter" }, "import")).toBe(
      "La importación agregaría 40 clientes pero su plan Starter admite 6 y ya tiene 4. No se importó nada.",
    );
  });

  it("concuerda en singular: 1 vehiculo / 1 registrado / agregaria 1 cliente", () => {
    expect(planLimitMessage({ ...vehicles, max: 1, used: 1 })).toBe(
      "Su plan Starter permite hasta 1 vehículo y ya tiene 1 registrado. Para agregar más, solicite ampliar el plan a NCI Automation.",
    );
    expect(planLimitMessage({ resource: "customers", max: 6, used: 6, adding: 1, planName: "Starter" }, "import")).toBe(
      "La importación agregaría 1 cliente pero su plan Starter admite 6 y ya tiene 6. No se importó nada.",
    );
  });

  it("nombra cada recurso en espanol (con tildes)", () => {
    const names: Record<PlanResource, string> = {
      users: "usuarios",
      drivers: "conductores",
      vehicles: "vehículos",
      customers: "clientes",
      documents: "documentos",
    };
    for (const [resource, plural] of Object.entries(names) as [PlanResource, string][]) {
      expect(planLimitMessage({ resource, max: 5, used: 5, adding: 1, planName: "Demo" })).toContain(`hasta 5 ${plural} `);
    }
  });

  it("con cupo parcial (se piden 2 y queda 1) sigue diciendo lo que permite el plan y lo que ya tiene", () => {
    expect(planLimitMessage({ resource: "vehicles", max: 10, used: 9, adding: 2, planName: "Starter" })).toContain(
      "permite hasta 10 vehículos y ya tiene 9 registrados.",
    );
  });

  it("un plan sin nombre no deja un hueco en la frase", () => {
    expect(planLimitMessage({ ...vehicles, planName: "  " })).toMatch(/^Su plan actual permite/);
    expect(planLimitMessage({ ...vehicles, planName: " Starter " })).toMatch(/^Su plan Starter permite/);
  });

  it("no usa jerga tecnica ni deja ninguna palabra sin tilde donde la lleva", () => {
    const all = [
      planLimitMessage(vehicles),
      planLimitMessage(vehicles, "import"),
      planLimitMessage({ ...vehicles, resource: "customers" }),
    ].join(" ");
    expect(all).not.toMatch(/tenant|catalogo|vehiculo|importacion|agregaria|importo|mas,/i);
  });
});

describe("PlanLimitError", () => {
  const details = { resource: "customers", max: 6, used: 6, adding: 1, planName: "Starter" } as const;

  it("es un Error reconocible con instanceof y conserva sus datos", () => {
    const error = new PlanLimitError(details);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error.name).toBe("PlanLimitError");
    expect(error).toMatchObject(details);
  });

  it("su message ya es el texto para el usuario (modo alta) y sirve para el modo importacion", () => {
    const error = new PlanLimitError(details);
    expect(error.message).toBe(planLimitMessage(details));
    expect(planLimitMessage(error, "import")).toBe(
      "La importación agregaría 1 cliente pero su plan Starter admite 6 y ya tiene 6. No se importó nada.",
    );
  });
});

describe("getPlanUsage: una sola definicion de 'usado'", () => {
  it("clientes = solo activos; vehiculos = todos menos los INACTIVE; el resto, todas las filas", async () => {
    const { db, raw } = fakeDb({ counts: { users: 7, drivers: 3, vehicles: 9, customers: 4, documents: 120 } });
    const result = await getPlanUsage(db, TENANT_ID);

    expect(result.usage).toEqual({ users: 7, drivers: 3, vehicles: 9, customers: 4, documents: 120 });
    expect(raw.customerAccount.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, active: true } });
    expect(raw.vehicle.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, status: { not: "INACTIVE" } } });
    expect(raw.tenantMembership.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
    expect(raw.driver.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
    expect(raw.document.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
  });

  it("devuelve el plan sin campos de mas (nada de ids ni banderas de funciones)", async () => {
    const { db, raw } = fakeDb();
    const { plan } = await getPlanUsage(db, TENANT_ID);
    expect(plan).toEqual({
      name: "Starter",
      code: "STARTER",
      maxUsers: 12,
      maxDrivers: 10,
      maxVehicles: 10,
      maxCustomers: 6,
      maxDocuments: 250,
    });
    expect(raw.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      select: {
        plan: {
          select: {
            name: true,
            code: true,
            maxUsers: true,
            maxDrivers: true,
            maxVehicles: true,
            maxCustomers: true,
            maxDocuments: true,
          },
        },
      },
    });
  });

  it("no bloquea nada: es lectura para mostrar", async () => {
    const { db, raw } = fakeDb();
    await getPlanUsage(db, TENANT_ID);
    expect(raw.$queryRaw).not.toHaveBeenCalled();
  });

  it("una empresa que no existe es un error, no un plan vacio", async () => {
    const { db } = fakeDb({ tenantMissing: true });
    await expect(getPlanUsage(db, TENANT_ID)).rejects.toThrow("No se encontró la empresa");
  });
});

describe("assertWithinPlanLimit", () => {
  it("bloquea el tenant ANTES de leer el plan y de contar", async () => {
    const { tx, calls } = fakeDb({ counts: { vehicles: 3 } });
    await assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 });
    expect(calls).toEqual(["raw:lock", "plan", "count:vehicles"]);
  });

  it("el bloqueo es FOR NO KEY UPDATE sobre el tenant indicado", async () => {
    const { tx, raw } = fakeDb();
    await assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "customers", adding: 1 });
    const [strings, ...values] = raw.$queryRaw.mock.calls[0];
    expect(strings.join("?")).toContain("FROM tenants WHERE id = ?::uuid FOR NO KEY UPDATE");
    expect(values).toEqual([TENANT_ID]);
  });

  it("cuenta clientes ACTIVOS y vehiculos que no esten INACTIVE, y solo ese recurso", async () => {
    const customers = fakeDb({ counts: { customers: 2 } });
    await assertWithinPlanLimit(customers.tx, { tenantId: TENANT_ID, resource: "customers", adding: 1 });
    expect(customers.raw.customerAccount.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, active: true } });
    expect(customers.calls.filter((call) => call.startsWith("count:"))).toEqual(["count:customers"]);

    const vehicles = fakeDb({ counts: { vehicles: 2 } });
    await assertWithinPlanLimit(vehicles.tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 });
    expect(vehicles.raw.vehicle.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, status: { not: "INACTIVE" } },
    });
    expect(vehicles.calls.filter((call) => call.startsWith("count:"))).toEqual(["count:vehicles"]);
  });

  it("deja pasar mientras quede cupo, incluido llegar exactamente al tope", async () => {
    for (const [resource, used, adding] of [
      ["vehicles", 0, 1],
      ["vehicles", 9, 1], // 10 de 10
      ["customers", 5, 1], // 6 de 6
      ["customers", 2, 4], // importacion que llega justo al tope
      ["customers", 6, 0], // nada que agregar con el cupo lleno
    ] as const) {
      const { tx } = fakeDb({ counts: { [resource]: used } });
      await expect(assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource, adding }), `${resource} ${used}+${adding}`).resolves.toBeUndefined();
    }
  });

  it("lanza PlanLimitError con el detalle cuando no cabe", async () => {
    const { tx } = fakeDb({ counts: { vehicles: 10 } });
    const error = await assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ resource: "vehicles", max: 10, used: 10, adding: 1, planName: "Starter" });
    expect(error.message).toBe(
      "Su plan Starter permite hasta 10 vehículos y ya tiene 10 registrados. Para agregar más, solicite ampliar el plan a NCI Automation.",
    );
  });

  it("una importacion que no cabe se rechaza completa (todo o nada)", async () => {
    const { tx } = fakeDb({ counts: { customers: 4 } });
    const error = await assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "customers", adding: 40 }).catch((e) => e);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(planLimitMessage(error, "import")).toBe(
      "La importación agregaría 40 clientes pero su plan Starter admite 6 y ya tiene 4. No se importó nada.",
    );
    // Una fila menos de lo que cabe sí pasa: el limite es el del plan, no uno arbitrario.
    const fits = fakeDb({ counts: { customers: 4 } });
    await expect(
      assertWithinPlanLimit(fits.tx, { tenantId: TENANT_ID, resource: "customers", adding: 2 }),
    ).resolves.toBeUndefined();
    const oneOver = fakeDb({ counts: { customers: 4 } });
    await expect(
      assertWithinPlanLimit(oneOver.tx, { tenantId: TENANT_ID, resource: "customers", adding: 3 }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("usa el limite del plan de la empresa (Professional admite 50 vehiculos)", async () => {
    const professional = { ...STARTER, name: "Professional", code: "PROFESSIONAL", maxVehicles: 50 };
    const { tx } = fakeDb({ plan: professional, counts: { vehicles: 49 } });
    await expect(assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 })).resolves.toBeUndefined();
    const full = fakeDb({ plan: professional, counts: { vehicles: 50 } });
    await expect(
      assertWithinPlanLimit(full.tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 }),
    ).rejects.toMatchObject({ max: 50, planName: "Professional" });
  });

  it("un plan que ya quedo excedido tras bajar de plan no admite mas altas", async () => {
    const { tx } = fakeDb({ counts: { customers: 8 } });
    await expect(assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "customers", adding: 1 })).rejects.toBeInstanceOf(
      PlanLimitError,
    );
  });

  it("inactivar libera cupo: si el conteo de activos baja, vuelve a caber", async () => {
    const before = fakeDb({ counts: { customers: 6 } });
    await expect(
      assertWithinPlanLimit(before.tx, { tenantId: TENANT_ID, resource: "customers", adding: 1 }),
    ).rejects.toBeInstanceOf(PlanLimitError);
    const after = fakeDb({ counts: { customers: 5 } });
    await expect(
      assertWithinPlanLimit(after.tx, { tenantId: TENANT_ID, resource: "customers", adding: 1 }),
    ).resolves.toBeUndefined();
  });

  it("una empresa inexistente es un error, no un cupo infinito", async () => {
    const { tx } = fakeDb({ tenantMissing: true });
    await expect(assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "vehicles", adding: 1 })).rejects.toThrow(
      "No se encontró la empresa",
    );
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "una cantidad a agregar invalida (%s) falla sin tocar la base de datos",
    async (adding) => {
      const { tx, calls } = fakeDb();
      await expect(assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: "vehicles", adding })).rejects.toThrow(RangeError);
      expect(calls).toEqual([]);
    },
  );

  it.each(["users", "drivers", "documents", "equipment", ""])(
    "solo se aplican limites a vehiculos y clientes: '%s' falla sin tocar la base de datos",
    async (resource) => {
      const { tx, calls } = fakeDb();
      await expect(
        assertWithinPlanLimit(tx, { tenantId: TENANT_ID, resource: resource as "vehicles", adding: 1 }),
      ).rejects.toThrow(RangeError);
      expect(calls).toEqual([]);
    },
  );

  it("el modulo no usa getDb ni lleva 'use server'", () => {
    const source = readFileSync("src/lib/server/plan-limits.ts", "utf8");
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/getDb|@\/lib\/server\/db"/);
    expect(source).not.toMatch(/^\s*["']use server["']/m);
  });
});
