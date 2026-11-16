import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePagination } from "@/lib/pagination";
import { listCustomers } from "@/lib/server/customer-data";
import { countFleet, listEquipment, listVehicles } from "@/lib/server/fleet-data";
import { getDb } from "@/lib/server/db";
import { getStartupCounts } from "@/lib/server/startup-data";
import { SERVICE_TYPE_TEMPLATES } from "@/lib/catalog/service-type-templates";
import { connectTestDb } from "./helpers/db";
import {
  createBasics,
  createTestTenant,
  createTestUser,
  destroyTestTenant,
  destroyTestUsers,
  sweepStaleTestTenants,
  type TestTenant,
} from "./helpers/tenants";

/**
 * Consultas de lectura de la Fase 1 contra PostgreSQL real: lo que filtran de verdad `tenantId`, el estado
 * (activos/inactivos), la búsqueda (insensible a mayúsculas y con `OR`) y los conteos de la lista de arranque.
 * `getDb()` usa el mismo `DATABASE_URL` que ya validó la guarda de `connectTestDb()`.
 */
const db = connectTestDb();
const page = (query: Record<string, string> = {}) => parsePagination(query);

let a: TestTenant;
let b: TestTenant;
let customersTenant: TestTenant;
const userIds: string[] = [];

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  a = await createTestTenant(db);
  b = await createTestTenant(db);
  customersTenant = await createTestTenant(db);
});

afterAll(async () => {
  await destroyTestTenant(db, a.id);
  await destroyTestTenant(db, b.id);
  await destroyTestTenant(db, customersTenant.id);
  await destroyTestUsers(db, userIds);
  await db.$disconnect();
  await getDb().$disconnect();
});

describe("getStartupCounts", () => {
  it("cuenta por empresa y solo lo activo; los tipos de servicio distinguen los que exigen equipo", async () => {
    await createBasics(db, a.id); // 1 tipo de servicio (plantilla) + 1 cliente
    await db.serviceType.create({ data: { tenantId: a.id, code: "SIN-EQUIPO", name: "Sin equipo", requiresEquipment: false } });
    await db.serviceType.create({ data: { tenantId: a.id, code: "VIEJO", name: "Viejo", active: false } });
    await db.customerAccount.create({ data: { tenantId: a.id, code: "C-2", name: "Inactivo", active: false } });
    await db.vehicle.createMany({
      data: [
        { tenantId: a.id, code: "V1", plate: "V1", type: "CAMION" },
        { tenantId: a.id, code: "V2", plate: "V2", type: "CAMION", status: "INACTIVE" },
        { tenantId: a.id, code: "V3", plate: "V3", type: "CAMION", status: "MAINTENANCE" },
      ],
    });
    await db.equipment.createMany({
      data: [
        { tenantId: a.id, code: "E1", type: "CHASIS" },
        { tenantId: a.id, code: "E2", type: "CHASIS", status: "INACTIVE" },
      ],
    });
    await db.driver.createMany({
      data: [
        { tenantId: a.id, code: "D1", name: "Uno", license: "L1" },
        { tenantId: a.id, code: "D2", name: "Dos", license: "L2", status: "INACTIVE" },
      ],
    });
    // Otra empresa con datos propios: no debe sumar.
    await db.vehicle.create({ data: { tenantId: b.id, code: "OV", plate: "OV", type: "CAMION" } });
    await db.customerAccount.create({ data: { tenantId: b.id, code: "OC", name: "Ajeno" } });

    const counts = await getStartupCounts(a.id);
    // La primera plantilla (CONTAINER) exige equipo; "Sin equipo" no; "Viejo" está inactivo y no cuenta.
    expect(SERVICE_TYPE_TEMPLATES[0].requiresEquipment).toBe(true);
    expect(counts).toMatchObject({
      serviceTypes: 2,
      serviceTypesRequiringEquipment: 1,
      customers: 1,
      vehicles: 2, // AVAILABLE + MAINTENANCE; el INACTIVE no cuenta
      equipment: 1,
      drivers: 1,
      trips: 0,
    });
    expect(await getStartupCounts(b.id)).toMatchObject({ vehicles: 1, customers: 1, serviceTypes: 0, trips: 0 });
  });
});

describe("listCustomers", () => {
  it("filtra por estado, busca sin distinguir mayúsculas dentro del tenant y cuenta solo accesos activos", async () => {
    await db.customerAccount.createMany({
      data: [
        { tenantId: customersTenant.id, code: "CLI-0101", name: "Importadora Colón", taxId: "8-123-456", contactEmail: "compras@colon.test" },
        { tenantId: customersTenant.id, code: "CLI-0102", name: "Zona Libre SA", contactName: "María Colón" },
        { tenantId: customersTenant.id, code: "CLI-0103", name: "Cliente Dormido", active: false },
      ],
    });
    // Otro tenant con un nombre que también coincide con "colon": nunca debe aparecer.
    await db.customerAccount.create({ data: { tenantId: a.id, code: "CLI-0199", name: "Colón de Otra Empresa" } });

    const importer = await db.customerAccount.findFirstOrThrow({ where: { tenantId: customersTenant.id, code: "CLI-0101" } });
    const u1 = await createTestUser(db, "portal-1");
    const u2 = await createTestUser(db, "portal-2");
    userIds.push(u1.id, u2.id);
    await db.customerMembership.createMany({
      data: [
        { tenantId: customersTenant.id, customerAccountId: importer.id, userId: u1.id, role: "CUSTOMER_ADMIN", active: true },
        { tenantId: customersTenant.id, customerAccountId: importer.id, userId: u2.id, role: "CUSTOMER_VIEWER", active: false },
      ],
    });

    const active = await listCustomers(customersTenant.id, page(), "activos");
    expect(active.items.map((c) => c.code)).toEqual(["CLI-0101", "CLI-0102"]); // ordenados por nombre
    expect(active.total).toBe(2);
    expect(active.items.find((c) => c.code === "CLI-0101")?.portalUsers).toBe(1); // el acceso inactivo no cuenta
    expect(active.items.find((c) => c.code === "CLI-0102")?.portalUsers).toBe(0);

    const inactive = await listCustomers(customersTenant.id, page(), "inactivos");
    expect(inactive.items.map((c) => c.code)).toEqual(["CLI-0103"]);
    expect((await listCustomers(customersTenant.id, page(), "todos")).total).toBe(3);

    // Búsqueda sin distinguir mayúsculas por nombre, código, RUC, contacto y correo.
    const byEmail = await listCustomers(customersTenant.id, page({ q: "COLON.TEST" }), "todos");
    expect(byEmail.items.map((c) => c.code)).toEqual(["CLI-0101"]);
    const byTaxId = await listCustomers(customersTenant.id, page({ q: "8-123" }), "todos");
    expect(byTaxId.items.map((c) => c.code)).toEqual(["CLI-0101"]);
    const byContact = await listCustomers(customersTenant.id, page({ q: "maría" }), "todos");
    expect(byContact.items.map((c) => c.code)).toEqual(["CLI-0102"]);
    const byName = await listCustomers(customersTenant.id, page({ q: "colón" }), "todos");
    expect(byName.items.map((c) => c.code)).toEqual(["CLI-0101", "CLI-0102"]); // nombre y contacto, ninguno de la otra empresa
    expect(byName.items.every((row) => row.tenantId === customersTenant.id)).toBe(true);
  });

  it("pagina con total correcto", async () => {
    const t = await createTestTenant(db);
    try {
      await db.customerAccount.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({ tenantId: t.id, code: `P-${String(i).padStart(2, "0")}`, name: `Cliente ${String(i).padStart(2, "0")}` })),
      });
      const first = await listCustomers(t.id, page({ pageSize: "10" }), "activos");
      const third = await listCustomers(t.id, page({ pageSize: "10", page: "3" }), "activos");
      expect(first).toMatchObject({ total: 25, totalPages: 3, hasNext: true, hasPrev: false });
      expect(first.items).toHaveLength(10);
      expect(third.items).toHaveLength(5);
      expect(third).toMatchObject({ hasNext: false, hasPrev: true });
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });
});

describe("flota", () => {
  it("vehículos y equipos: estado, búsqueda y aislamiento por empresa", async () => {
    const t = await createTestTenant(db);
    try {
      await db.vehicle.createMany({
        data: [
          { tenantId: t.id, code: "T-01", plate: "AB-1111", type: "Cabezal" },
          { tenantId: t.id, code: "T-02", plate: "CD-2222", type: "Camión", status: "INACTIVE" },
          { tenantId: t.id, code: "T-03", plate: "EF-3333", type: "Pickup", status: "MAINTENANCE" },
        ],
      });
      await db.equipment.createMany({
        data: [
          { tenantId: t.id, code: "CH-01", type: "Chasis 40" },
          { tenantId: t.id, code: "CH-02", type: "Plataforma", status: "INACTIVE" },
        ],
      });
      await db.vehicle.create({ data: { tenantId: b.id, code: "AJ-1", plate: "AB-9999", type: "Cabezal" } });

      expect((await listVehicles(t.id, page(), "activos")).items.map((v) => v.plate)).toEqual(["AB-1111", "EF-3333"]);
      expect((await listVehicles(t.id, page(), "inactivos")).items.map((v) => v.plate)).toEqual(["CD-2222"]);
      expect((await listVehicles(t.id, page(), "todos")).total).toBe(3);
      // Búsqueda parcial e insensible a mayúsculas por placa, código o tipo; "ab-" no trae la placa AB-9999 de otra empresa.
      expect((await listVehicles(t.id, page({ q: "ab-" }), "todos")).items.map((v) => v.plate)).toEqual(["AB-1111"]);
      expect((await listVehicles(t.id, page({ q: "PICKUP" }), "todos")).items.map((v) => v.plate)).toEqual(["EF-3333"]);

      expect((await listEquipment(t.id, page(), "activos")).items.map((e) => e.code)).toEqual(["CH-01"]);
      expect((await listEquipment(t.id, page({ q: "plata" }), "todos")).items.map((e) => e.code)).toEqual(["CH-02"]);
      expect(await countFleet(t.id)).toEqual({ vehicles: 2, equipment: 1 });
    } finally {
      await destroyTestTenant(db, t.id);
    }
  });
});
