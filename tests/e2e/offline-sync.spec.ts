import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { hashPassword } from "../../src/lib/server/crypto";
import { login } from "./helpers/auth";

config({ path: ".env.local" });

const db = new PrismaClient();

const users = {
  driverOne: ["conductor1@panatruck.local", "Conductor2026!"],
  driverTwo: ["conductor2@panatruck.local", "Conductor22026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
};

async function ensureDriverTwo() {
  const panatruck = await db.tenant.findUniqueOrThrow({ where: { slug: "panatruck-demo" } });
  const driverTwoUser = await db.user.upsert({
    where: { email: users.driverTwo[0] },
    update: { active: true, passwordHash: await hashPassword(users.driverTwo[1]) },
    create: {
      email: users.driverTwo[0],
      name: "Conductor Panatruck Dos",
      passwordHash: await hashPassword(users.driverTwo[1]),
    },
  });
  await db.tenantMembership.upsert({
    where: { tenantId_userId_role: { tenantId: panatruck.id, userId: driverTwoUser.id, role: "DRIVER" } },
    update: { active: true },
    create: { tenantId: panatruck.id, userId: driverTwoUser.id, role: "DRIVER" },
  });
  await db.driver.updateMany({ where: { tenantId: panatruck.id, code: "DR-2" }, data: { userId: driverTwoUser.id } });
}

async function sync(request: APIRequestContext, tenantSlug: string, commands: unknown[]) {
  return request.post(`/api/t/${tenantSlug}/driver/sync`, {
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    data: { schemaVersion: 1, commands },
  });
}

function buildTransition(overrides: Partial<{ tripId: string; nextStatus: string; idempotencyKey: string; localSequence: number; note: string }> = {}) {
  return {
    schemaVersion: 1,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    clientQueuedAt: new Date().toISOString(),
    localSequence: overrides.localSequence ?? 1,
    payload: {
      actionType: "trip.transition",
      tripId: overrides.tripId,
      nextStatus: overrides.nextStatus ?? "DRIVER_CONFIRMED",
      note: overrides.note ?? "Offline e2e",
    },
  };
}

/**
 * Crea un viaje ASSIGNED al conductor DR-1 de Panatruck para esta prueba,
 * de manera que múltiples corridas y otras suites no interfieran.
 */
async function createIsolatedTrip() {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "panatruck-demo" }, include: { branding: true } });
  const driver = await db.driver.findFirstOrThrow({ where: { tenantId: tenant.id, code: "DR-1" } });
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { tenantId: tenant.id, code: "VH-1" } });
  const equipment = await db.equipment.findFirstOrThrow({ where: { tenantId: tenant.id, code: "EQ-1" } });
  const serviceType = await db.serviceType.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const customer = await db.customerAccount.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const stamp = Date.now();
  const trip = await db.trip.create({
    data: {
      tenantId: tenant.id,
      customerAccountId: customer.id,
      serviceTypeId: serviceType.id,
      reference: `OFFLINE-E2E-${stamp}`,
      status: "ASSIGNED",
      origin: `OFFLINE-ORIG-${stamp}`,
      destination: `OFFLINE-DEST-${stamp}`,
      scheduledAt: new Date(stamp + 1_000),
      eta: new Date(stamp + 3 * 60 * 60 * 1000),
      driverId: driver.id,
      vehicleId: vehicle.id,
      equipmentId: equipment.id,
      customerVisibleStatus: "Unidad asignada",
      routePoints: [
        { label: "Inicio", lat: 9.0, lng: -79.0 },
        { label: "Fin", lat: 9.1, lng: -79.1 },
      ],
    },
  });
  return trip.id;
}

test.describe.serial("OFFLINE-E2E driver command sync", () => {
  let context: BrowserContext;
  let apiRequest: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    await ensureDriverTwo();
    context = await browser.newContext();
    const page = await context.newPage();
    await login(page, users.driverOne[0], users.driverOne[1]);
    await page.close();
    apiRequest = context.request;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("OFFLINE-E2E-001 sincroniza transicion y es idempotente", async () => {
    const tripId = await createIsolatedTrip();
    const command = buildTransition({ tripId, nextStatus: "DRIVER_CONFIRMED" });
    const first = await sync(apiRequest, "panatruck-demo", [command]);
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.results[0].status).toBe("ACCEPTED");
    expect(firstBody.results[0].serverEventId).toBeTruthy();

    const second = await sync(apiRequest, "panatruck-demo", [command]);
    const secondBody = await second.json();
    expect(secondBody.results[0].status).toBe("DUPLICATE");
  });

  test("OFFLINE-E2E-002 acepta orden por localSequence", async () => {
    const tripId = await createIsolatedTrip();
    const commands = [
      buildTransition({ tripId, nextStatus: "DRIVER_CONFIRMED", localSequence: 1 }),
      buildTransition({ tripId, nextStatus: "EN_ROUTE_TO_ORIGIN", localSequence: 2 }),
    ];
    const response = await sync(apiRequest, "panatruck-demo", commands);
    const body = await response.json();
    expect(body.results.every((result: { status: string }) => result.status === "ACCEPTED")).toBe(true);
  });

  test("OFFLINE-E2E-004 rechaza payload alterado con misma idempotencyKey", async () => {
    const tripId = await createIsolatedTrip();
    const command = buildTransition({ tripId, nextStatus: "DRIVER_CONFIRMED" });
    const original = await sync(apiRequest, "panatruck-demo", [command]);
    expect(original.status()).toBe(200);
    const tampered = { ...command, payload: { ...command.payload, note: "Contenido diferente" } };
    const response = await sync(apiRequest, "panatruck-demo", [tampered]);
    const body = await response.json();
    expect(body.results[0].status).toBe("REJECTED");
    expect(body.results[0].errorCode).toBe("PAYLOAD_TAMPERED");
  });

  test("OFFLINE-E2E-005 rechaza Origin no permitido", async () => {
    const tripId = await createIsolatedTrip();
    const response = await apiRequest.post(`/api/t/panatruck-demo/driver/sync`, {
      headers: { "content-type": "application/json", origin: "https://evil.example.com" },
      data: { schemaVersion: 1, commands: [buildTransition({ tripId, nextStatus: "DRIVER_CONFIRMED" })] },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("ORIGIN_MISMATCH");
  });

  test("OFFLINE-E2E-006 rechaza payload invalido", async () => {
    const response = await sync(apiRequest, "panatruck-demo", [
      {
        schemaVersion: 1,
        idempotencyKey: randomUUID(),
        clientQueuedAt: new Date().toISOString(),
        localSequence: 1,
        payload: {
          actionType: "trip.transition",
          tripId: "00000000-0000-4000-8000-000000000000",
          nextStatus: "CLOSED",
        },
      },
    ]);
    expect(response.status()).toBe(400);
  });

  test("OFFLINE-E2E-007 conductor no puede sincronizar viaje de otro conductor", async ({ browser }) => {
    const tripId = await createIsolatedTrip();
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await login(otherPage, users.driverTwo[0], users.driverTwo[1]);
    const response = await sync(otherContext.request, "panatruck-demo", [buildTransition({ tripId, nextStatus: "DRIVER_CONFIRMED" })]);
    const body = await response.json();
    expect(body.results[0].status).toBe("REJECTED");
    expect(body.results[0].errorCode).toBe("ASSIGNMENT_CHANGED");
    await otherContext.close();
  });

  test("OFFLINE-E2E-008 usuario de otro tenant no accede al sync", async ({ browser }) => {
    const other = await browser.newContext();
    const page = await other.newPage();
    await login(page, users.transOwner[0], users.transOwner[1]);
    const response = await other.request.post(`/api/t/panatruck-demo/driver/sync`, {
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      data: { schemaVersion: 1, commands: [] },
      maxRedirects: 0,
    });
    expect([303, 307, 400, 403]).toContain(response.status());
    await other.close();
  });
});

test.describe("security headers", () => {
  test("home responde con CSP y X-Content-Type-Options", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("sync exige Origin permitido", async ({ request }) => {
    const response = await request.post(`/api/t/panatruck-demo/driver/sync`, {
      headers: { "content-type": "application/json", origin: "https://foo.com" },
      data: { schemaVersion: 1, commands: [] },
    });
    expect([400, 403]).toContain(response.status());
  });
});
