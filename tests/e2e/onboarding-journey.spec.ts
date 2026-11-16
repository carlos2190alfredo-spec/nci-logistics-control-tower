import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/**
 * ADR-038 — recorrido de arranque de un tenant nuevo: catalogos → "Nuevo viaje" → asignacion.
 * Usa un tenant descartable (nunca los demo) y lo elimina al final.
 */

config({ path: ".env.local" });

const db = new PrismaClient();
let tenant: ThrowawayTenant;
const stamp = Date.now();
const year = new Date().getFullYear() + 1;
const CUSTOMER_NAME = `Cliente ZZ ${stamp}`;
const PLATE = `ZZE2E${String(stamp).slice(-5)}`;
const EQUIPMENT_CODE = `ZZ-E2E-CH-${String(stamp).slice(-5)}`;
const PLACE = `Patio ZZ ${stamp}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tenant = await createThrowawayTenant(db);
  await db.driver.create({
    data: { tenantId: tenant.id, code: "ZZ-DR-1", name: "Conductor ZZ E2E", license: "E2E-LIC" },
  });
});

test.afterAll(async () => {
  if (tenant) await destroyThrowawayTenant(db, tenant);
  await db.$disconnect();
});

test("ONB-001 un tenant nuevo llega a su primer viaje asignado sin tocar SQL", async ({ page }) => {
  test.setTimeout(240_000);
  const base = `/t/${tenant.slug}`;
  await login(page, tenant.ops.email, tenant.ops.password);

  // 1. El Resumen de un tenant vacio guia con "Primeros pasos".
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const checklist = page.getByTestId("startup-checklist");
  await expect(checklist).toBeVisible({ timeout: 60_000 });
  for (const key of ["customers", "vehicles", "equipment", "drivers", "first-trip"]) {
    await expect(page.getByTestId(`startup-step-${key}`)).toBeVisible();
  }

  // 2. Cliente.
  await page.goto(`${base}/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Nombre o razón social" }).fill(CUSTOMER_NAME);
  await page.getByRole("button", { name: "Agregar cliente" }).click();
  await expect(page.getByText(`Cliente «${CUSTOMER_NAME}» creado`)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="customer-row-"]').filter({ hasText: CUSTOMER_NAME })).toHaveCount(1);

  // 3. Vehiculo y equipo.
  await page.goto(`${base}/fleet`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Placa", exact: true }).fill(PLATE);
  await page.getByRole("button", { name: "Agregar vehículo" }).click();
  await expect(page.getByText(`Vehículo ${PLATE} agregado`)).toBeVisible({ timeout: 30_000 });
  await page.goto(`${base}/fleet?vista=equipos`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Código del equipo" }).fill(EQUIPMENT_CODE);
  await page.getByRole("button", { name: "Agregar equipo" }).click();
  await expect(page.getByText(`Equipo ${EQUIPMENT_CODE} agregado`)).toBeVisible({ timeout: 30_000 });

  // 4. Lugar frecuente.
  await page.goto(`${base}/locations`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Nombre del lugar" }).fill(PLACE);
  await page.getByRole("button", { name: "Agregar lugar" }).click();
  await expect(page.getByText(`Lugar «${PLACE}» agregado`)).toBeVisible({ timeout: 30_000 });

  // 5. Nuevo viaje (servicio sin chasis).
  await page.goto(`${base}/trips/new`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: CUSTOMER_NAME });
  await page.getByRole("combobox", { name: "Tipo de servicio" }).selectOption({ label: "Carga general" });
  await expect(page.getByText("Este servicio no necesita chasis ni remolque.")).toBeVisible();
  await page.getByRole("combobox", { name: "Origen", exact: true }).fill(PLACE);
  await page.getByRole("combobox", { name: "Destino", exact: true }).fill("Bodega Panamá E2E");
  await page.getByLabel("Fecha y hora de recogida").fill(`${year}-03-10T14:00`);
  await page.getByRole("button", { name: "Crear viaje" }).click();
  await page.waitForURL(/\/trips\?creado=/, { timeout: 60_000 });

  const card = page.locator('[data-testid^="trip-card-"]').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/ring-2/);

  // 6. Asignacion sin equipo con la tarjeta existente.
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { tenantId: tenant.id } });
  await card.getByLabel("Vehiculo").selectOption({ label: vehicle.code });
  await card.getByLabel("Equipo").selectOption("");
  await card.getByLabel("Conductor").selectOption({ label: "ZZ-DR-1" });
  await card.getByRole("button", { name: "Asignar" }).click();
  await expect(card.getByText(/asignado a Conductor ZZ E2E/)).toBeVisible({ timeout: 30_000 });

  // 7. Verificacion en la base: pedido de operaciones convertido, viaje asignado, hora de pared de Panama.
  const request = await db.serviceRequest.findFirstOrThrow({ where: { tenantId: tenant.id }, include: { trip: true } });
  expect(request.status).toBe("CONVERTED");
  expect(request.source).toBe("OPERATIONS");
  expect(request.reference).toMatch(/-SR-0001$/);
  const trip = request.trip!;
  expect(trip.reference).toMatch(/-TR-0001$/);
  expect(trip.status).toBe("ASSIGNED");
  expect(trip.equipmentId).toBeNull();
  expect(trip.scheduledAt.toISOString()).toBe(`${year}-03-10T19:00:00.000Z`);
  const assignment = await db.tripAssignment.findFirstOrThrow({ where: { tripId: trip.id, active: true } });
  expect(assignment.equipmentId).toBeNull();

  // 8. Con un servicio que SI requiere chasis, el equipo se asigna y la lista de arranque desaparece.
  await page.goto(`${base}/trips/new`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: CUSTOMER_NAME });
  await page.getByRole("combobox", { name: "Tipo de servicio" }).selectOption({ label: "Transporte de contenedor" });
  await page.getByRole("combobox", { name: "Origen", exact: true }).fill(PLACE);
  await page.getByRole("combobox", { name: "Destino", exact: true }).fill("Terminal E2E");
  await page.getByLabel("Fecha y hora de recogida").fill(`${year}-04-10T09:30`);
  await page.getByRole("button", { name: "Crear viaje" }).click();
  await page.waitForURL(/\/trips\?creado=/, { timeout: 60_000 });
  const second = page.locator('[data-testid^="trip-card-"].ring-2');
  await expect(second.getByLabel("Equipo")).toBeVisible();
  await expect(second.getByLabel("Equipo").locator("option", { hasText: "Sin equipo" })).toHaveCount(0);

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("startup-checklist")).toHaveCount(0);
});
