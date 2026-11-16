import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/server/db-errors";
import { connectTestDb } from "./helpers/db";
import { createBasics, createTestTenant, destroyTestTenant, sweepStaleTestTenants, type TenantBasics, type TestTenant } from "./helpers/tenants";

/**
 * Contratos de esquema de la Fase 1 (migración 20261115181215) y de las restricciones de las que dependen las acciones,
 * comprobados contra las tablas reales: columnas, valores por defecto, nulabilidad y la forma de los errores.
 */
const db = connectTestDb();

type ColumnRow = { column_name: string; is_nullable: "YES" | "NO"; column_default: string | null; data_type: string };

async function column(table: string, name: string): Promise<ColumnRow> {
  const rows = await db.$queryRaw<ColumnRow[]>`
    SELECT column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${name}`;
  expect(rows, `columna ${table}.${name}`).toHaveLength(1);
  return rows[0];
}

let tenant: TestTenant;
let basics: TenantBasics;

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  tenant = await createTestTenant(db);
  basics = await createBasics(db, tenant.id);
});

afterAll(async () => {
  await destroyTestTenant(db, tenant.id);
  await db.$disconnect();
});

describe("migración de la Fase 1", () => {
  it("customer_accounts: datos de contacto y fiscales opcionales", async () => {
    for (const name of ["tax_id", "contact_name", "contact_email", "contact_phone", "address", "internal_notes"]) {
      expect((await column("customer_accounts", name)).is_nullable, name).toBe("YES");
    }
  });

  it("locations: active por defecto true y coordenadas opcionales", async () => {
    expect(await column("locations", "active")).toMatchObject({ is_nullable: "NO", data_type: "boolean" });
    expect((await column("locations", "active")).column_default).toBe("true");
    expect((await column("locations", "latitude")).is_nullable).toBe("YES");
    expect((await column("locations", "longitude")).is_nullable).toBe("YES");
  });

  it("service_types.requires_equipment: NOT NULL con valor por defecto true", async () => {
    expect(await column("service_types", "requires_equipment")).toMatchObject({ is_nullable: "NO", column_default: "true" });
  });

  it("service_requests.source: NOT NULL con valor por defecto 'PORTAL'", async () => {
    const source = await column("service_requests", "source");
    expect(source.is_nullable).toBe("NO");
    expect(source.column_default).toContain("PORTAL");
  });

  it("trip_assignments.equipment_id acepta NULL y una asignación sin equipo se guarda", async () => {
    expect((await column("trip_assignments", "equipment_id")).is_nullable).toBe("YES");

    const driver = await db.driver.create({ data: { tenantId: tenant.id, code: "DRV-1", name: "Conductor Uno", license: "LIC-1" } });
    const vehicle = await db.vehicle.create({ data: { tenantId: tenant.id, code: "V-1", plate: "V-1-P", type: "CAMION" } });
    const request = await db.serviceRequest.create({
      data: {
        tenantId: tenant.id,
        customerAccountId: basics.customerId,
        serviceTypeId: basics.serviceTypeId,
        reference: "REF-SIN-EQUIPO",
        origin: "A",
        destination: "B",
        requestedDate: new Date("2026-12-02T12:00:00Z"),
      },
    });
    const trip = await db.trip.create({
      data: {
        tenantId: tenant.id,
        customerAccountId: basics.customerId,
        serviceTypeId: basics.serviceTypeId,
        serviceRequestId: request.id,
        reference: "TR-SIN-EQUIPO",
        origin: "A",
        destination: "B",
        scheduledAt: new Date("2026-12-02T12:00:00Z"),
      },
    });
    const assignment = await db.tripAssignment.create({
      data: { tenantId: tenant.id, tripId: trip.id, vehicleId: vehicle.id, driverId: driver.id, equipmentId: null, scheduledAt: trip.scheduledAt },
    });
    expect(assignment.equipmentId).toBeNull();
  });

  it("un equipo con asignaciones no se puede borrar (onDelete Restrict): se inactiva", async () => {
    const equipment = await db.equipment.create({ data: { tenantId: tenant.id, code: "EQ-1", type: "CHASIS" } });
    const trip = await db.trip.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const driver = await db.driver.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const vehicle = await db.vehicle.findFirstOrThrow({ where: { tenantId: tenant.id } });
    await db.tripAssignment.create({
      data: { tenantId: tenant.id, tripId: trip.id, vehicleId: vehicle.id, driverId: driver.id, equipmentId: equipment.id, scheduledAt: trip.scheduledAt },
    });
    const error = await db.equipment.delete({ where: { id: equipment.id } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForeignKeyViolation(error)).toBe(true);
    // Inactivar sí funciona y conserva la fila.
    await db.equipment.update({ where: { id: equipment.id }, data: { status: "INACTIVE" } });
    expect((await db.equipment.findUniqueOrThrow({ where: { id: equipment.id } })).status).toBe("INACTIVE");
  });
});

describe("restricciones únicas: forma real del P2002 que usan las acciones", () => {
  it("vehículo: placa y código repetidos se distinguen por campo", async () => {
    await db.vehicle.create({ data: { tenantId: tenant.id, code: "UNI-1", plate: "UNI-PLATE", type: "CAMION" } });

    const samePlate = await db.vehicle.create({ data: { tenantId: tenant.id, code: "UNI-2", plate: "UNI-PLATE", type: "CAMION" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(samePlate, "plate")).toBe(true);
    expect(isUniqueViolation(samePlate, "code")).toBe(false);

    const sameCode = await db.vehicle.create({ data: { tenantId: tenant.id, code: "UNI-1", plate: "OTRA-PLACA", type: "CAMION" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(sameCode, "code")).toBe(true);
    expect(isUniqueViolation(sameCode, "plate")).toBe(false);
  });

  it("cliente, equipo, lugar y tipo de servicio: código o nombre repetido es P2002", async () => {
    const dupCustomer = await db.customerAccount.create({ data: { tenantId: tenant.id, code: "CLI-BASE", name: "Otro" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(dupCustomer, "code")).toBe(true);

    await db.location.create({ data: { tenantId: tenant.id, name: "Puerto X", address: "" } });
    const dupLocation = await db.location.create({ data: { tenantId: tenant.id, name: "Puerto X", address: "" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(dupLocation, "name")).toBe(true);

    const serviceType = await db.serviceType.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const dupServiceType = await db.serviceType.create({ data: { tenantId: tenant.id, code: serviceType.code, name: "Duplicado" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(dupServiceType, "code")).toBe(true);

    await db.equipment.create({ data: { tenantId: tenant.id, code: "EQ-UNICO", type: "CHASIS" } });
    const dupEquipment = await db.equipment.create({ data: { tenantId: tenant.id, code: "EQ-UNICO", type: "CHASIS" } }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isUniqueViolation(dupEquipment, "code")).toBe(true);
  });

  it("el mismo código en otra empresa es legal (la unicidad es por tenant)", async () => {
    const other = await createTestTenant(db);
    try {
      await expect(db.vehicle.create({ data: { tenantId: other.id, code: "UNI-1", plate: "UNI-PLATE", type: "CAMION" } })).resolves.toBeTruthy();
      await expect(db.customerAccount.create({ data: { tenantId: other.id, code: "CLI-BASE", name: "Cliente base" } })).resolves.toBeTruthy();
    } finally {
      await destroyTestTenant(db, other.id);
    }
  });
});
