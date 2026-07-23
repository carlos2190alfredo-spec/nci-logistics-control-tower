import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { TOTP } from "otpauth";
import { PrismaClient } from "../../src/generated/prisma";
import { hashPassword } from "../../src/lib/server/crypto";

config({ path: ".env.local" });

const db = new PrismaClient();
const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const MFA_USERS = new Set(["owner@panatruck.local", "owner@translogistica.local", "platform@nci.local"]);

const users = {
  customer: ["cliente@clienteportuario.local", "Cliente2026!"],
  operations: ["operaciones@panatruck.local", "Operaciones2026!"],
  driver: ["conductor1@panatruck.local", "Conductor2026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
  panCustomerTwo: ["cliente2@panatruck.local", "Cliente22026!"],
  panDriverTwo: ["conductor2@panatruck.local", "Conductor22026!"],
} as const;

const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lr6N9wAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle");

  if (MFA_USERS.has(email) && page.url().includes("/mfa/verify")) {
    const totp = new TOTP({ secret: SEED_TOTP_SECRET, algorithm: "SHA1", digits: 6, period: 30 });
    await page.getByLabel("Codigo de verificacion").fill(totp.generate());
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForLoadState("networkidle");
  }
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(/\/login$/, { timeout: 10_000 }).catch(async () => {
    await page.context().clearCookies();
    await page.goto("/login");
  });
  await expect(page).toHaveURL(/\/login$/);
}

function driverTripCard(page: Page, tripId: string) {
  return page.getByTestId(`driver-trip-card-${tripId}`);
}

async function advanceDriver(page: Page, tripId: string, status: string) {
  const card = driverTripCard(page, tripId);
  await card.locator('select[name="nextStatus"]').selectOption(status);
  await card.getByRole("button", { name: "Confirmar accion" }).click();
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany({
    where: { scope: { in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login"] } },
  });
});

test.describe.serial("E2E-FLOW logistics service workflow", () => {
  test.setTimeout(240_000);

  const stamp = Date.now();
  const uniqueOrigin = `MIT E2E ${stamp}`;
  const uniqueDestination = `Balboa E2E ${stamp}`;
  const booking = `BOOK-E2E-${stamp}`;
  const requestedAt = new Date(stamp + 30 * 24 * 60 * 60 * 1000 + (stamp % 10_000) * 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
  let requestReference = "";
  let tripId = "";
  let tripReference = "";
  let evidencePath = "";

  test.beforeAll(async () => {
    const panatruck = await db.tenant.findUniqueOrThrow({ where: { slug: "panatruck-demo" } });
    const customers = await db.customerAccount.findMany({ where: { tenantId: panatruck.id }, orderBy: { code: "asc" } });
    const customerTwo = customers[1];
    const customerTwoUser = await db.user.upsert({
      where: { email: users.panCustomerTwo[0] },
      update: { active: true, passwordHash: await hashPassword(users.panCustomerTwo[1]) },
      create: {
        email: users.panCustomerTwo[0],
        name: "Cliente Panatruck Dos",
        passwordHash: await hashPassword(users.panCustomerTwo[1]),
      },
    });
    await db.customerMembership.upsert({
      where: {
        customerAccountId_userId_role: {
          customerAccountId: customerTwo.id,
          userId: customerTwoUser.id,
          role: "CUSTOMER_ADMIN",
        },
      },
      update: { active: true },
      create: {
        tenantId: panatruck.id,
        customerAccountId: customerTwo.id,
        userId: customerTwoUser.id,
        role: "CUSTOMER_ADMIN",
      },
    });

    const driverTwoUser = await db.user.upsert({
      where: { email: users.panDriverTwo[0] },
      update: { active: true, passwordHash: await hashPassword(users.panDriverTwo[1]) },
      create: {
        email: users.panDriverTwo[0],
        name: "Conductor Panatruck Dos",
        passwordHash: await hashPassword(users.panDriverTwo[1]),
      },
    });
    await db.tenantMembership.upsert({
      where: {
        tenantId_userId_role: {
          tenantId: panatruck.id,
          userId: driverTwoUser.id,
          role: "DRIVER",
        },
      },
      update: { active: true },
      create: { tenantId: panatruck.id, userId: driverTwoUser.id, role: "DRIVER" },
    });
    await db.driver.updateMany({
      where: { tenantId: panatruck.id, code: "DR-2" },
      data: { userId: driverTwoUser.id },
    });
  });

  test("E2E-FLOW-001 complete request to POD closure", async ({ page }) => {
    evidencePath = path.join(test.info().outputDir, `evidence-${randomUUID()}.png`);
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(evidencePath, pngFixture);

    await login(page, ...users.customer);
    await expect(page).toHaveURL(/\/t\/panatruck-demo\/portal$/);
    await page.getByLabel("Tipo de servicio").selectOption({ label: "Transporte de contenedor" });
    await page.getByLabel("Origen").fill(uniqueOrigin);
    await page.getByLabel("Destino").fill(uniqueDestination);
    await page.getByLabel("Fecha requerida").fill(requestedAt);
    await page.getByLabel("Numero de contenedor").fill(`NCIU${String(stamp).slice(-7)}`);
    await page.getByLabel("Booking o referencia").fill(booking);
    await page.getByRole("button", { name: "Crear solicitud" }).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => db.serviceRequest.count({ where: { origin: uniqueOrigin, destination: uniqueDestination } })).toBe(1);
    await logout(page);

    const request = await db.serviceRequest.findFirstOrThrow({
      where: { origin: uniqueOrigin, destination: uniqueDestination },
    });
    requestReference = request.reference;

    await login(page, ...users.operations);
    await expect(page).toHaveURL(/\/t\/panatruck-demo$/);
    const requestCard = page.getByTestId(`request-card-${request.id}`);
    await expect(requestCard.getByText(requestReference)).toBeVisible();
    await requestCard.getByRole("button", { name: "Confirmar y convertir" }).click();
    await page.waitForLoadState("networkidle");

    await expect.poll(async () => db.trip.count({ where: { serviceRequestId: request.id } })).toBe(1);
    const trip = await db.trip.findFirstOrThrow({ where: { serviceRequestId: request.id } });
    tripId = trip.id;
    tripReference = trip.reference;
    await page.goto("/t/panatruck-demo/trips");

    const operationsTripCard = page.getByTestId(`trip-card-${tripId}`);
    // El listado de conductores puede tener uno de offline-testing (Juan
    // Offline) que ordena alfabéticamente antes que DR-1. Seleccionamos DR-1
    // explícitamente para que el flujo termine con el conductor esperado.
    await operationsTripCard.locator('select[name="driverId"]').selectOption({ label: "DR-1" });
    await operationsTripCard.getByRole("button", { name: "Asignar" }).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => {
      const assigned = await db.trip.findUnique({ where: { id: tripId }, select: { status: true, driverId: true } });
      return assigned?.driverId ? assigned.status : "UNASSIGNED";
    }).toBe("ASSIGNED");
    await logout(page);

    await login(page, ...users.driver);
    await page.goto("/t/panatruck-demo/driver");
    await expect(driverTripCard(page, tripId).getByText(uniqueOrigin)).toBeVisible();
    for (const status of [
      "DRIVER_CONFIRMED",
      "EN_ROUTE_TO_ORIGIN",
      "ARRIVED_AT_ORIGIN",
      "WAITING_AT_ORIGIN",
      "LOADING_OR_PICKUP",
      "IN_TRANSIT",
      "ARRIVED_AT_DESTINATION",
      "DELIVERY_IN_PROGRESS",
      "DELIVERED",
      "EVIDENCE_PENDING",
    ]) {
      await advanceDriver(page, tripId, status);
    }
    const driverCard = driverTripCard(page, tripId);
    await driverCard.getByLabel("Descripcion interna de incidencia").fill("Demora E2E por espera en terminal.");
    await driverCard.getByLabel("Mensaje visible al cliente").fill("Incidencia E2E visible para cliente.");
    await driverCard.getByRole("button", { name: "Reportar" }).click();
    await page.waitForLoadState("networkidle");

    const refreshedDriverCard = driverTripCard(page, tripId);
    await refreshedDriverCard.getByLabel("Nombre del receptor").fill("Receptor E2E");
    await refreshedDriverCard.getByLabel("Observacion de entrega").fill("Entrega E2E sin novedades finales.");
    await refreshedDriverCard.getByLabel("Fotografia o documento de evidencia").setInputFiles(evidencePath);
    await refreshedDriverCard.getByRole("button", { name: "Registrar evidencia y firma" }).click();
    await page.waitForLoadState("networkidle");
    await logout(page);

    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo/trips");
    const proofCard = page.getByTestId(`trip-card-${tripId}`);
    await proofCard.getByRole("button", { name: "Aprobar evidencia y generar POD" }).click();
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => {
      const approved = await db.trip.findUnique({ where: { id: tripId }, select: { status: true, proofReady: true } });
      return approved?.proofReady ? approved.status : "POD_PENDING";
    }).toBe("EVIDENCE_APPROVED");
    await page.goto("/t/panatruck-demo/trips");
    const closeCard = page.getByTestId(`trip-card-${tripId}`);
    await closeCard.locator('select[name="nextStatus"]').selectOption("CLOSED");
    await closeCard.getByRole("button", { name: "Avanzar" }).click();
    await page.waitForLoadState("networkidle");
    await logout(page);

    await login(page, ...users.customer);
    await expect(page.getByText(uniqueOrigin).first()).toBeVisible();
    await expect(page.getByText("Servicio cerrado").first()).toBeVisible();
    await expect(page.getByText("Incidencia E2E visible para cliente.").first()).toBeVisible();
    const podResponse = await page.request.get(`/api/t/panatruck-demo/proof/${tripId}`);
    expect(podResponse.ok()).toBe(true);
    expect(podResponse.headers()["content-type"]).toContain("application/pdf");

    const [podDocument, evidenceDocument, notifications, auditLogs] = await Promise.all([
      db.document.findFirst({ where: { tripId, mimeType: "application/pdf", visibility: "CUSTOMER_VISIBLE" } }),
      db.document.findFirst({ where: { tripId, mimeType: "image/png", visibility: "CUSTOMER_VISIBLE" } }),
      db.notificationDelivery.count({ where: { tenantId: request.tenantId, customerAccountId: request.customerAccountId } }),
      db.auditLog.count({ where: { tenantId: request.tenantId, entityId: { in: [request.id, tripId] } } }),
    ]);
    expect(podDocument?.objectKey).toContain(`/trips/${tripReference}/pod/`);
    expect(evidenceDocument?.objectKey).toContain(`/trips/${tripReference}/evidence/`);
    expect(notifications).toBeGreaterThan(0);
    expect(auditLogs).toBeGreaterThan(0);
  });

  test("E2E-FLOW-002 TransLogistica user cannot access created Panatruck POD", async ({ page }) => {
    await login(page, ...users.transOwner);
    const response = await page.request.get(`/api/t/panatruck-demo/proof/${tripId}`, { maxRedirects: 0 });
    expect([303, 307, 404]).toContain(response.status());
    const body = await response.text();
    expect(body).not.toContain(tripReference);
  });

  test("E2E-FLOW-003 other Panatruck customer cannot access created POD", async ({ page }) => {
    await login(page, ...users.panCustomerTwo);
    const response = await page.request.get(`/api/t/panatruck-demo/proof/${tripId}`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).not.toContain(tripReference);
  });

  test("E2E-FLOW-004 unassigned driver cannot see created trip", async ({ page }) => {
    await login(page, ...users.panDriverTwo);
    await page.goto("/t/panatruck-demo/driver");
    await expect(page.getByText(uniqueOrigin)).toHaveCount(0);
    await expect(page.getByText(tripReference)).toHaveCount(0);
  });
});
