import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";

/**
 * ADR-035 — flujos de excepcion, mensajes de bloqueo y concurrencia.
 * Crea sus propios viajes y recursos con codigos unicos y los elimina al final
 * para no acumular viajes activos en la DB local.
 */

config({ path: ".env.local" });

const db = new PrismaClient();
const OPERATIONS = ["operaciones@panatruck.local", "Operaciones2026!"] as const;
const CUSTOMER = ["cliente@clienteportuario.local", "Cliente2026!"] as const;

const stamp = Date.now();
const tag = `X${String(stamp).slice(-7)}`;

type Fixture = {
  tenantId: string;
  tenantSlug: string;
  customerAccountId: string;
  serviceTypeId: string;
  vehicleIds: string[];
  equipmentIds: string[];
  driverIds: string[];
  tripIds: string[];
  requestIds: string[];
};

const fx: Fixture = {
  tenantId: "",
  tenantSlug: "",
  customerAccountId: "",
  serviceTypeId: "",
  vehicleIds: [],
  equipmentIds: [],
  driverIds: [],
  tripIds: [],
  requestIds: [],
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Esperar hidratacion: con el dev server en frio, React puede reponer los
  // valores por defecto del formulario despues de un fill temprano.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

async function createResources(suffix: string) {
  const vehicle = await db.vehicle.create({
    data: { tenantId: fx.tenantId, code: `V-${tag}-${suffix}`, plate: `P${tag}${suffix}`, type: "Tractomula" },
  });
  const equipment = await db.equipment.create({
    data: { tenantId: fx.tenantId, code: `E-${tag}-${suffix}`, type: "Chasis 40" },
  });
  const driver = await db.driver.create({
    data: { tenantId: fx.tenantId, code: `D-${tag}-${suffix}`, name: `Conductor ${tag}-${suffix}`, license: "E2E" },
  });
  fx.vehicleIds.push(vehicle.id);
  fx.equipmentIds.push(equipment.id);
  fx.driverIds.push(driver.id);
  return { vehicle, equipment, driver };
}

async function createTrip(suffix: string, scheduledAt: Date, status: "CONFIRMED" | "DELIVERED" = "CONFIRMED") {
  const trip = await db.trip.create({
    data: {
      tenantId: fx.tenantId,
      customerAccountId: fx.customerAccountId,
      serviceTypeId: fx.serviceTypeId,
      reference: `E2E-${tag}-${suffix}`,
      status,
      origin: `Origen ${tag}`,
      destination: `Destino ${tag}`,
      scheduledAt,
    },
  });
  fx.tripIds.push(trip.id);
  return trip;
}

test.beforeAll(async () => {
  const membership = await db.tenantMembership.findFirstOrThrow({
    where: { user: { email: OPERATIONS[0] }, active: true },
    include: { tenant: true },
  });
  fx.tenantId = membership.tenantId;
  fx.tenantSlug = membership.tenant.slug;
  const customer = await db.customerMembership.findFirstOrThrow({
    where: { user: { email: CUSTOMER[0] }, tenantId: fx.tenantId, active: true },
  });
  fx.customerAccountId = customer.customerAccountId;
  const serviceType = await db.serviceType.findFirstOrThrow({ where: { tenantId: fx.tenantId, active: true } });
  fx.serviceTypeId = serviceType.id;
});

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany({ where: { scope: { in: ["auth.login", "login"] } } });
});

test.afterAll(async () => {
  await db.trip.deleteMany({ where: { id: { in: fx.tripIds } } });
  await db.serviceRequest.deleteMany({ where: { id: { in: fx.requestIds } } });
  await db.tripAssignment.deleteMany({ where: { driverId: { in: fx.driverIds } } });
  await db.driver.deleteMany({ where: { id: { in: fx.driverIds } } });
  await db.vehicle.deleteMany({ where: { id: { in: fx.vehicleIds } } });
  await db.equipment.deleteMany({ where: { id: { in: fx.equipmentIds } } });
  await db.$disconnect();
});

test.describe.serial("ADR-035 trip exceptions and concurrency", () => {
  test.setTimeout(240_000);

  test("EXC-001 operations cancels a confirmed trip with a mandatory reason", async ({ page }) => {
    const trip = await createTrip("CANCEL", new Date(stamp + 40 * 24 * 3600 * 1000));
    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/trips`);
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId(`trip-card-${trip.id}`);
    await card.getByText("Cancelar o registrar excepcion").click();
    await card.getByLabel("Accion de excepcion").selectOption("CANCELLED");
    await card.getByLabel("Motivo").fill("Cliente reprogramo la carga para otra semana");
    await card.getByRole("button", { name: "Aplicar excepcion" }).click();

    await expect.poll(async () => (await db.trip.findUnique({ where: { id: trip.id } }))?.status).toBe("CANCELLED");
    const event = await db.tripEvent.findFirstOrThrow({ where: { tripId: trip.id, toStatus: "CANCELLED" } });
    expect(event.reason).toBe("Cliente reprogramo la carga para otra semana");
    expect(event.note).toBe("Servicio cancelado por operaciones.");
    const auditRow = await db.auditLog.findFirst({ where: { entityId: trip.id, action: "trip.cancel" } });
    expect(auditRow).not.toBeNull();
  });

  test("EXC-002 failed delivery then retry, with reason enforced server-side", async ({ page }) => {
    const trip = await createTrip("FAIL", new Date(stamp + 41 * 24 * 3600 * 1000));
    await db.trip.update({ where: { id: trip.id }, data: { status: "DELIVERY_IN_PROGRESS" } });
    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/trips`);
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId(`trip-card-${trip.id}`);
    await card.getByText("Cancelar o registrar excepcion").click();
    await card.getByLabel("Accion de excepcion").selectOption("DELIVERY_FAILED");
    // Motivo demasiado corto: el navegador permite enviarlo (required se cumple), el servidor lo rechaza.
    await card.getByLabel("Motivo").fill("no");
    await card.getByRole("button", { name: "Aplicar excepcion" }).click();
    await expect(card.getByRole("alert")).toContainText("Escriba el motivo", { timeout: 30_000 });
    expect((await db.trip.findUnique({ where: { id: trip.id } }))?.status).toBe("DELIVERY_IN_PROGRESS");

    await card.getByLabel("Motivo").fill("Receptor ausente en bodega de destino");
    await card.getByRole("button", { name: "Aplicar excepcion" }).click();
    await expect.poll(async () => (await db.trip.findUnique({ where: { id: trip.id } }))?.status).toBe("DELIVERY_FAILED");

    // La revalidacion re-renderiza la tarjeta con las nuevas excepciones disponibles.
    await expect(card.getByLabel("Accion de excepcion").locator('option[value="IN_TRANSIT"]')).toHaveCount(1, { timeout: 30_000 });
    if (!(await card.getByLabel("Motivo").isVisible())) await card.getByText("Cancelar o registrar excepcion").click();
    await card.getByLabel("Accion de excepcion").selectOption("IN_TRANSIT");
    await card.getByLabel("Motivo").fill("Nuevo intento coordinado para las 15:00");
    await card.getByRole("button", { name: "Aplicar excepcion" }).click();
    await expect.poll(async () => (await db.trip.findUnique({ where: { id: trip.id } }))?.status).toBe("IN_TRANSIT");
  });

  test("EXC-003 a stale form submission is rejected with a visible message and no event", async ({ page }) => {
    // Un OPERATIONS_MANAGER avanza DELIVERED -> EVIDENCE_PENDING.
    const trip = await createTrip("STALE", new Date(stamp + 42 * 24 * 3600 * 1000), "DELIVERED");
    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/trips`);
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId(`trip-card-${trip.id}`);
    await expect(card.getByRole("button", { name: "Avanzar" })).toBeVisible({ timeout: 60_000 });

    // Otro actor cambia el estado despues de que la pagina se cargo.
    await db.trip.update({ where: { id: trip.id }, data: { status: "EVIDENCE_PENDING" } });
    await card.getByRole("button", { name: "Avanzar" }).click();
    await expect(card.getByRole("alert")).toContainText('"Evidencia pendiente"', { timeout: 30_000 });
    expect(await db.tripEvent.count({ where: { tripId: trip.id } })).toBe(0);
  });

  test("EXC-004 blocked assignment explains the schedule conflict instead of failing silently", async ({ page }) => {
    const { vehicle, equipment, driver } = await createResources("C");
    const other = await createResources("C2");
    const when = new Date(stamp + 43 * 24 * 3600 * 1000);
    const busy = await createTrip("BUSY", when);
    await db.trip.update({
      where: { id: busy.id },
      data: { status: "ASSIGNED", driverId: driver.id, vehicleId: other.vehicle.id, equipmentId: other.equipment.id },
    });
    const trip = await createTrip("WANTS", new Date(when.getTime() + 60 * 60 * 1000));

    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/trips`);
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId(`trip-card-${trip.id}`);
    await card.getByLabel("Vehiculo").selectOption(vehicle.id);
    await card.getByLabel("Equipo").selectOption(equipment.id);
    await card.getByLabel("Conductor").selectOption(driver.id);
    await card.getByRole("button", { name: "Asignar" }).click();
    await expect(card.getByRole("alert")).toContainText("Conflicto de agenda", { timeout: 30_000 });
    await expect(card.getByRole("alert")).toContainText(busy.reference);
    expect((await db.trip.findUnique({ where: { id: trip.id } }))?.status).toBe("CONFIRMED");
  });

  test("EXC-005 two simultaneous assignments of the same driver: exactly one wins", async ({ browser }) => {
    // La vista /trips de la DB local acumula cientos de viajes activos de corridas
    // E2E previas; dos sesiones + dos cargas en dev requieren margen extra.
    test.setTimeout(540_000);
    const { driver } = await createResources("R");
    const second = await createResources("R2");
    const first = await createResources("R1");
    const when = new Date(stamp + 44 * 24 * 3600 * 1000);
    const tripA = await createTrip("RACEA", when);
    const tripB = await createTrip("RACEB", when);

    // Dos sesiones independientes (dos despachadores), cada una en su propio contexto.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    for (const p of [pageA, pageB]) {
      await login(p, ...OPERATIONS);
      await p.goto(`/t/${fx.tenantSlug}/trips`);
      await p.waitForLoadState("networkidle");
    }

    const cardA = pageA.getByTestId(`trip-card-${tripA.id}`);
    const cardB = pageB.getByTestId(`trip-card-${tripB.id}`);
    await cardA.getByLabel("Vehiculo").selectOption(first.vehicle.id);
    await cardA.getByLabel("Equipo").selectOption(first.equipment.id);
    await cardA.getByLabel("Conductor").selectOption(driver.id);
    await cardB.getByLabel("Vehiculo").selectOption(second.vehicle.id);
    await cardB.getByLabel("Equipo").selectOption(second.equipment.id);
    await cardB.getByLabel("Conductor").selectOption(driver.id);

    await Promise.all([
      cardA.getByRole("button", { name: "Asignar" }).click(),
      cardB.getByRole("button", { name: "Asignar" }).click(),
    ]);

    await expect
      .poll(async () => db.trip.count({ where: { id: { in: [tripA.id, tripB.id] }, status: "ASSIGNED" } }))
      .toBe(1);
    // Esperar a que ambas acciones terminen antes de contar.
    await pageA.waitForLoadState("networkidle");
    await pageB.waitForLoadState("networkidle");
    const assigned = await db.trip.findMany({ where: { id: { in: [tripA.id, tripB.id] }, driverId: driver.id } });
    expect(assigned).toHaveLength(1);
    const loser = assigned[0].id === tripA.id ? cardB : cardA;
    await expect(loser.getByRole("alert")).toContainText("Conflicto de agenda", { timeout: 30_000 });
    await contextA.close();
    await contextB.close();
  });

  test("EXC-006 operations asks for info, customer answers, operations rejects", async ({ page }) => {
    const request = await db.serviceRequest.create({
      data: {
        tenantId: fx.tenantId,
        customerAccountId: fx.customerAccountId,
        serviceTypeId: fx.serviceTypeId,
        reference: `E2E-${tag}-SR`,
        status: "REQUESTED",
        origin: `Origen ${tag}`,
        destination: `Destino ${tag}`,
        requestedDate: new Date(stamp + 45 * 24 * 3600 * 1000),
        clientRequestKey: randomUUID(),
      },
    });
    fx.requestIds.push(request.id);

    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/requests`);
    await page.waitForLoadState("networkidle");
    let card = page.getByTestId(`request-card-${request.id}`);
    await card.getByText("Pedir informacion o rechazar").click();
    await card.getByLabel("Accion").selectOption("request_info");
    await card.getByLabel("Mensaje para el cliente").fill("Indique el numero de sello del contenedor");
    await card.getByRole("button", { name: "Enviar" }).click();
    await expect
      .poll(async () => (await db.serviceRequest.findUnique({ where: { id: request.id } }))?.status)
      .toBe("INFORMATION_REQUIRED");
    // Mientras espera al cliente no se puede convertir.
    await page.reload();
    card = page.getByTestId(`request-card-${request.id}`);
    await expect(card.getByRole("button", { name: "Confirmar y convertir" })).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, ...CUSTOMER);
    await page.goto(`/t/${fx.tenantSlug}/portal`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Operaciones necesita: Indique el numero de sello del contenedor")).toBeVisible();
    await page.getByLabel("Su respuesta").fill("Sello ABC-12345");
    await page.getByRole("button", { name: "Enviar respuesta" }).click();
    await expect
      .poll(async () => (await db.serviceRequest.findUnique({ where: { id: request.id } }))?.status)
      .toBe("UNDER_REVIEW");
    const answered = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(answered.customerNotes).toContain("Sello ABC-12345");

    await page.context().clearCookies();
    await login(page, ...OPERATIONS);
    await page.goto(`/t/${fx.tenantSlug}/requests`);
    await page.waitForLoadState("networkidle");
    card = page.getByTestId(`request-card-${request.id}`);
    await card.getByText("Pedir informacion o rechazar").click();
    await card.getByLabel("Accion").selectOption("reject");
    await card.getByLabel("Mensaje para el cliente").fill("Sin capacidad de chasis para esa fecha");
    await card.getByRole("button", { name: "Enviar" }).click();
    await expect
      .poll(async () => (await db.serviceRequest.findUnique({ where: { id: request.id } }))?.status)
      .toBe("REJECTED");
    const rejected = await db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(rejected.statusReason).toBe("Sin capacidad de chasis para esa fecha");
  });
});
