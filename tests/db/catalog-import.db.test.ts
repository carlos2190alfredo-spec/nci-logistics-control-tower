import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BULK_TRANSACTION_OPTIONS, MAX_EQUIPMENT_PER_TENANT, MAX_LOCATIONS_PER_TENANT } from "@/lib/catalog/limits";
import { validateImport, type ImportKind, type ImportValidRow } from "@/lib/import/catalogs";
import { parseCsv } from "@/lib/import/csv";
import { applyCatalogImport } from "@/lib/server/import-apply";
import { PlanLimitError } from "@/lib/server/plan-limits";
import { connectTestDb } from "./helpers/db";
import {
  createTestTenant,
  destroyTestTenant,
  seedCustomers,
  seedVehicles,
  sweepStaleTestTenants,
  type PlanCode,
  type TestTenant,
} from "./helpers/tenants";

/**
 * Importación CSV de catálogos contra PostgreSQL real (ADR-038): el recorrido completo que hace
 * `importCatalogCsvAction` (parseCsv → validateImport → applyCatalogImport en una transacción), sin la sesión.
 */
const db = connectTestDb();
const tenants: TestTenant[] = [];

async function freshTenant(planCode: PlanCode = "PROFESSIONAL"): Promise<TestTenant> {
  const tenant = await createTestTenant(db, { planCode });
  tenants.push(tenant);
  return tenant;
}

/** El mismo recorrido que la acción: texto → filas válidas → una transacción. Devuelve el resultado o lanza. */
async function importCsv(tenant: TestTenant, kind: ImportKind, csv: string) {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(`CSV ilegible: ${parsed.error}`);
  const validation = validateImport(kind, parsed);
  expect(validation.headerIssues).toEqual([]);
  expect(validation.invalid).toEqual([]);
  return db.$transaction(
    (tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind, rows: validation.valid }),
    BULK_TRANSACTION_OPTIONS,
  );
}

beforeAll(async () => {
  await sweepStaleTestTenants(db);
});

afterAll(async () => {
  for (const tenant of tenants) await destroyTestTenant(db, tenant.id);
  await db.$disconnect();
});

describe("clientes", () => {
  it("genera códigos CLI-nnnn a partir del máximo y omite los que ya existen sin distinguir tildes ni mayúsculas", async () => {
    const tenant = await freshTenant();
    await db.customerAccount.create({ data: { tenantId: tenant.id, code: "CLI-0005", name: "Ñandú Logística" } });

    const outcome = await importCsv(
      tenant,
      "customers",
      ["Nombre,RUC,Correo", "ÑANDU LOGISTICA,1-1-1,a@x.com", "Bodega Central,2-2-2,b@x.com", "Zeta S.A.,3-3-3,"].join("\n"),
    );
    expect(outcome).toEqual({ created: 2, skippedExisting: 1 });

    const rows = await db.customerAccount.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
    expect(rows.map((r) => [r.code, r.name])).toEqual([
      ["CLI-0005", "Ñandú Logística"],
      ["CLI-0006", "Bodega Central"],
      ["CLI-0007", "Zeta S.A."],
    ]);
    expect(rows.every((r) => r.tenantId === tenant.id && r.active)).toBe(true);
    expect(rows.find((r) => r.name === "Bodega Central")).toMatchObject({ taxId: "2-2-2", contactEmail: "b@x.com" });
  });

  it("un código explícito igual al que se generaría para otra fila no pierde ninguna fila en silencio", async () => {
    const tenant = await freshTenant();
    // La fila sin código recibiría CLI-0001, que la segunda fila ya pide de forma explícita.
    const outcome = await importCsv(tenant, "customers", ["Nombre,Código", "Cliente A,", "Cliente B,CLI-0001", "Cliente C,"].join("\n"));

    const rows = await db.customerAccount.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
    // Lo informado coincide con lo guardado: nada se descarta sin avisar.
    expect(rows).toHaveLength(outcome.created);
    expect(outcome.created).toBe(3);
    expect(rows.map((r) => r.name)).toEqual(["Cliente A", "Cliente B", "Cliente C"]);
    // El código que pidió el usuario se respeta; los generados no chocan con él.
    expect(rows.find((r) => r.name === "Cliente B")?.code).toBe("CLI-0001");
    expect(new Set(rows.map((r) => r.code)).size).toBe(3);
  });

  it("volver a importar el mismo archivo no crea nada (idempotente)", async () => {
    const tenant = await freshTenant();
    const csv = ["Nombre", "Cliente Uno", "Cliente Dos", "Cliente Tres"].join("\n");
    expect(await importCsv(tenant, "customers", csv)).toEqual({ created: 3, skippedExisting: 0 });
    expect(await importCsv(tenant, "customers", csv)).toEqual({ created: 0, skippedExisting: 3 });
    expect(await db.customerAccount.count({ where: { tenantId: tenant.id } })).toBe(3);
  });

  it("todo o nada: si no caben en el plan no se importa ninguno y el conteo queda igual", async () => {
    const tenant = await freshTenant("DEMO");
    const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: "DEMO" } });
    await seedCustomers(db, tenant.id, plan.maxCustomers - 1);
    const csv = ["Nombre", "Nuevo Uno", "Nuevo Dos"].join("\n");

    const error = await importCsv(tenant, "customers", csv).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ resource: "customers", adding: 2, used: plan.maxCustomers - 1, max: plan.maxCustomers });
    expect(await db.customerAccount.count({ where: { tenantId: tenant.id } })).toBe(plan.maxCustomers - 1);
    expect(await db.customerAccount.count({ where: { tenantId: tenant.id, name: { startsWith: "Nuevo" } } })).toBe(0);
  });

  it("los clientes inactivos no cuentan para el plan, pero sí evitan duplicar el nombre", async () => {
    const tenant = await freshTenant("DEMO");
    const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: "DEMO" } });
    await seedCustomers(db, tenant.id, plan.maxCustomers);
    await db.customerAccount.updateMany({ where: { tenantId: tenant.id, code: "SEED-1" }, data: { active: false } });

    const outcome = await importCsv(tenant, "customers", ["Nombre", "Cliente SEED 1", "Cliente Libre"].join("\n"));
    // "Cliente SEED 1" ya existe (inactivo): se omite, no se duplica. "Cliente Libre" ocupa el cupo liberado.
    expect(outcome).toEqual({ created: 1, skippedExisting: 1 });
  });

  it("dos importaciones simultáneas del mismo archivo no duplican ni fallan: la segunda ve lo de la primera", async () => {
    const tenant = await freshTenant();
    const names = Array.from({ length: 25 }, (_, i) => `Cliente Paralelo ${i + 1}`);
    const csv = ["Nombre", ...names].join("\n");

    const results = await Promise.allSettled([importCsv(tenant, "customers", csv), importCsv(tenant, "customers", csv)]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const outcomes = results.map((r) => (r as PromiseFulfilledResult<{ created: number; skippedExisting: number }>).value);
    expect(outcomes.reduce((sum, o) => sum + o.created, 0)).toBe(25);
    expect(outcomes.reduce((sum, o) => sum + o.skippedExisting, 0)).toBe(25);
    expect(await db.customerAccount.count({ where: { tenantId: tenant.id } })).toBe(25);
    // Y los códigos son consecutivos y únicos.
    const codes = (await db.customerAccount.findMany({ where: { tenantId: tenant.id }, select: { code: true } })).map((c) => c.code).sort();
    expect(new Set(codes).size).toBe(25);
  });

  it("un cliente de OTRA empresa con el mismo nombre o código no cuenta como duplicado ni se toca", async () => {
    const a = await freshTenant();
    const b = await freshTenant();
    await db.customerAccount.create({ data: { tenantId: b.id, code: "CLI-0001", name: "Cliente Compartido" } });

    const outcome = await importCsv(a, "customers", ["Nombre,Código", "Cliente Compartido,CLI-0001"].join("\n"));
    expect(outcome).toEqual({ created: 1, skippedExisting: 0 });
    expect(await db.customerAccount.count({ where: { tenantId: a.id } })).toBe(1);
    const untouched = await db.customerAccount.findMany({ where: { tenantId: b.id } });
    expect(untouched).toHaveLength(1);
    expect(untouched[0].name).toBe("Cliente Compartido");
  });
});

describe("vehículos", () => {
  it("placa y unidad comparten un espacio de identidad: se omite si coincide cualquiera (sin distinguir mayúsculas)", async () => {
    const tenant = await freshTenant();
    await db.vehicle.create({ data: { tenantId: tenant.id, code: "U-10", plate: "AB-1234", type: "CAMION" } });

    const outcome = await importCsv(
      tenant,
      "vehicles",
      [
        "Placa,Unidad,Tipo",
        "ab-1234,U-99,Camión", // misma placa
        "ZZ-0001,u-10,Camión", // mismo código de unidad
        "CD-5678,U-20,Cabezal", // nuevo
        "EF-0002,,Pickup", // la unidad toma la placa
      ].join("\n"),
    );
    expect(outcome).toEqual({ created: 2, skippedExisting: 2 });
    const rows = await db.vehicle.findMany({ where: { tenantId: tenant.id }, orderBy: { plate: "asc" } });
    expect(rows.map((r) => [r.plate, r.code])).toEqual([
      ["AB-1234", "U-10"],
      ["CD-5678", "U-20"],
      ["EF-0002", "EF-0002"],
    ]);
  });

  it("todo o nada con el plan: ninguna fila entra si no caben, y el límite cuenta solo vehículos activos", async () => {
    const tenant = await freshTenant("DEMO");
    const plan = await db.tenantPlan.findFirstOrThrow({ where: { code: "DEMO" } });
    await seedVehicles(db, tenant.id, plan.maxVehicles - 1);
    await db.vehicle.updateMany({ where: { tenantId: tenant.id, code: "VEH-1" }, data: { status: "INACTIVE" } });
    // Activos: max-2 → caben 2 nuevos.
    const rows = ["Placa", "NEW-001", "NEW-002", "NEW-003"];
    const tooMany = await importCsv(tenant, "vehicles", rows.join("\n")).then(
      () => null,
      (e: unknown) => e,
    );
    expect(tooMany).toBeInstanceOf(PlanLimitError);
    expect(await db.vehicle.count({ where: { tenantId: tenant.id, plate: { startsWith: "NEW" } } })).toBe(0);

    expect(await importCsv(tenant, "vehicles", rows.slice(0, 3).join("\n"))).toEqual({ created: 2, skippedExisting: 0 });
  });

  it("la misma placa en otra empresa no bloquea la importación y no la modifica", async () => {
    const a = await freshTenant();
    const b = await freshTenant();
    await db.vehicle.create({ data: { tenantId: b.id, code: "B-1", plate: "AB-1234", type: "CAMION" } });
    expect(await importCsv(a, "vehicles", ["Placa", "AB-1234"].join("\n"))).toEqual({ created: 1, skippedExisting: 0 });
    expect(await db.vehicle.findMany({ where: { tenantId: b.id } })).toHaveLength(1);
    expect((await db.vehicle.findFirstOrThrow({ where: { tenantId: a.id } })).tenantId).toBe(a.id);
  });
});

describe("equipos y lugares", () => {
  it("equipos: omite existentes y respeta el tope fijo por empresa sin importar nada si se supera", async () => {
    const tenant = await freshTenant();
    await db.equipment.createMany({
      data: Array.from({ length: MAX_EQUIPMENT_PER_TENANT - 100 }, (_, i) => ({ tenantId: tenant.id, code: `EQ-${String(i + 1).padStart(4, "0")}`, type: "CHASIS" })),
    });
    const before = await db.equipment.count({ where: { tenantId: tenant.id } });

    const overflow: ImportValidRow<"equipment">[] = Array.from({ length: 101 }, (_, i) => ({ line: i + 2, data: { code: `NUEVO-${i + 1}`, type: "CHASIS" } }));
    await expect(db.$transaction((tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind: "equipment", rows: overflow }), BULK_TRANSACTION_OPTIONS)).rejects.toThrow(
      "No se importó nada",
    );
    expect(await db.equipment.count({ where: { tenantId: tenant.id } })).toBe(before);

    // Con 100 sí caben, y uno de ellos ya existe: se omite.
    const fits: ImportValidRow<"equipment">[] = [
      { line: 2, data: { code: "eq-0001", type: "CHASIS" } }, // existente (otra capitalización)
      ...Array.from({ length: 99 }, (_, i) => ({ line: i + 3, data: { code: `NUEVO-${i + 1}`, type: "CHASIS" } })),
    ];
    const outcome = await db.$transaction((tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind: "equipment", rows: fits }), BULK_TRANSACTION_OPTIONS);
    expect(outcome).toEqual({ created: 99, skippedExisting: 1 });
    expect(await db.equipment.count({ where: { tenantId: tenant.id } })).toBe(before + 99);
  });

  it("900 filas se escriben en lotes (más de uno) y el conteo coincide con lo informado", async () => {
    const tenant = await freshTenant();
    const rows: ImportValidRow<"equipment">[] = Array.from({ length: 900 }, (_, i) => ({ line: i + 2, data: { code: `LOTE-${String(i + 1).padStart(4, "0")}`, type: "CHASIS" } }));
    const outcome = await db.$transaction((tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind: "equipment", rows }), BULK_TRANSACTION_OPTIONS);
    expect(outcome).toEqual({ created: 900, skippedExisting: 0 });
    expect(await db.equipment.count({ where: { tenantId: tenant.id } })).toBe(900);
  });

  it("lugares: se crean activos, con o sin coordenadas, y el tope fijo se respeta", async () => {
    const tenant = await freshTenant();
    const outcome = await importCsv(
      tenant,
      "locations",
      ["Nombre,Dirección,Latitud,Longitud", "Puerto de Manzanillo,Colón,9.3547,-79.8981", "Bodega Sin Mapa,Calle 5,,"].join("\n"),
    );
    expect(outcome).toEqual({ created: 2, skippedExisting: 0 });
    const rows = await db.location.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
    expect(rows.map((r) => [r.name, r.active, r.latitude, r.longitude])).toEqual([
      ["Bodega Sin Mapa", true, null, null],
      ["Puerto de Manzanillo", true, 9.3547, -79.8981],
    ]);

    await db.location.createMany({
      data: Array.from({ length: MAX_LOCATIONS_PER_TENANT - 2 }, (_, i) => ({ tenantId: tenant.id, name: `Lugar ${i}`, address: "" })),
    });
    const overflow: ImportValidRow<"locations">[] = [{ line: 2, data: { name: "Uno de más", address: "", latitude: null, longitude: null } }];
    await expect(db.$transaction((tx) => applyCatalogImport(tx, { tenantId: tenant.id, kind: "locations", rows: overflow }), BULK_TRANSACTION_OPTIONS)).rejects.toThrow(
      "No se importó nada",
    );
    expect(await db.location.count({ where: { tenantId: tenant.id } })).toBe(MAX_LOCATIONS_PER_TENANT);
  });
});
