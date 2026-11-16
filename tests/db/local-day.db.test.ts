import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tenantCalendarDate, tenantDayBounds } from "@/lib/datetime";
import { connectTestDb } from "./helpers/db";
import { createBasics, createTestTenant, destroyTestTenant, sweepStaleTestTenants, type TenantBasics, type TestTenant } from "./helpers/tenants";

/**
 * El día del viaje es el de la empresa (Panamá): las consultas del motor de recomendación y de los tableros usan
 * `tenantDayBounds` (instantes) y `tenantCalendarDate` (columnas `@db.Date`), nunca la zona del servidor.
 */
const db = connectTestDb();
let tenant: TestTenant;
let basics: TenantBasics;
let driverId: string;

// Lunes 13 de julio de 2026, 19:30 en Panamá = 00:30Z del martes 14.
const MONDAY_EVENING = new Date("2026-07-14T00:30:00.000Z");

beforeAll(async () => {
  await sweepStaleTestTenants(db);
  tenant = await createTestTenant(db);
  basics = await createBasics(db, tenant.id);
  driverId = (await db.driver.create({ data: { tenantId: tenant.id, code: "D1", name: "Conductor", license: "L1" } })).id;
});

afterAll(async () => {
  await destroyTestTenant(db, tenant.id);
  await db.$disconnect();
});

describe("excepciones de disponibilidad (@db.Date)", () => {
  it("la fecha local del viaje encuentra la excepción de ESE día, no la del día UTC", async () => {
    await db.driverAvailabilityException.createMany({
      data: [
        { tenantId: tenant.id, driverId, date: new Date("2026-07-13"), type: "VACATION" }, // lunes (día de Panamá del viaje)
        { tenantId: tenant.id, driverId, date: new Date("2026-07-14"), type: "DAY_OFF" }, // martes (día UTC del instante)
      ],
    });
    const found = await db.driverAvailabilityException.findMany({
      where: { tenantId: tenant.id, driverId, date: tenantCalendarDate(MONDAY_EVENING)! },
    });
    expect(found.map((e) => e.type)).toEqual(["VACATION"]);
  });
});

describe("ventana del día de la empresa", () => {
  it("incluye de las 00:00 a las 23:59:59.999 de Panamá y excluye el primer instante del día siguiente", async () => {
    const bounds = tenantDayBounds(MONDAY_EVENING)!;
    const at = (iso: string) => ({
      tenantId: tenant.id,
      customerAccountId: basics.customerId,
      serviceTypeId: basics.serviceTypeId,
      reference: `W-${iso}`,
      origin: "A",
      destination: "B",
      scheduledAt: new Date(iso),
    });
    await db.trip.createMany({
      data: [
        at("2026-07-13T04:59:59.999Z"), // 23:59:59.999 del domingo en Panamá: fuera
        at("2026-07-13T05:00:00.000Z"), // 00:00 del lunes: dentro
        at("2026-07-14T00:30:00.000Z"), // 19:30 del lunes: dentro (en UTC ya es martes)
        at("2026-07-14T04:59:59.999Z"), // 23:59:59.999 del lunes: dentro
        at("2026-07-14T05:00:00.000Z"), // 00:00 del martes: fuera
      ],
    });
    const inside = await db.trip.findMany({
      where: { tenantId: tenant.id, scheduledAt: { gte: bounds.start, lt: bounds.end } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    });
    expect(inside.map((t) => t.scheduledAt.toISOString())).toEqual([
      "2026-07-13T05:00:00.000Z",
      "2026-07-14T00:30:00.000Z",
      "2026-07-14T04:59:59.999Z",
    ]);
  });
});
