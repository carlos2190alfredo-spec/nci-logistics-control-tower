import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { createThrowawayMember, createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/**
 * ADR-038 — roles, aislamiento entre empresas y límites de plan recorridos por la interfaz.
 * Empresa A (plan DEMO: 3 clientes y 5 vehículos) y empresa B (otro tenant con datos propios), ambas descartables.
 */

config({ path: ".env.local" });

const db = new PrismaClient();
let a: ThrowawayTenant;
let b: ThrowawayTenant;
let dispatcher: { email: string; password: string };
let safety: { email: string; password: string };
let driver: { email: string; password: string };
let aCustomerId: string;
let bCustomerId: string;
let bCustomerName: string;
let bVehicleId: string;
let bLocationId: string;
let bServiceTypeId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  a = await createThrowawayTenant(db, { planCode: "DEMO" });
  b = await createThrowawayTenant(db, { planCode: "PROFESSIONAL" });
  dispatcher = await createThrowawayMember(db, a, "DISPATCHER", "despacho");
  safety = await createThrowawayMember(db, a, "SAFETY_MANAGER", "seguridad");
  driver = await createThrowawayMember(db, a, "DRIVER", "conductor");

  aCustomerId = (await db.customerAccount.create({ data: { tenantId: a.id, code: "CLI-0001", name: `Cliente A ${a.stamp}` } })).id;
  bCustomerName = `Cliente SECRETO B ${b.stamp}`;
  bCustomerId = (await db.customerAccount.create({ data: { tenantId: b.id, code: "CLI-0001", name: bCustomerName } })).id;
  bVehicleId = (await db.vehicle.create({ data: { tenantId: b.id, code: "B-UNIT", plate: `SECB${String(b.stamp).slice(-5)}`, type: "CAMION" } })).id;
  bLocationId = (await db.location.create({ data: { tenantId: b.id, name: `Patio SECRETO B ${b.stamp}`, address: "Colón" } })).id;
  bServiceTypeId = (await db.serviceType.findFirstOrThrow({ where: { tenantId: b.id } })).id;
});

test.afterAll(async () => {
  if (a) await destroyThrowawayTenant(db, a);
  if (b) await destroyThrowawayTenant(db, b);
  await db.$disconnect();
});

async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  return response;
}

test("ACCESS-001 el despachador y seguridad consultan los catálogos pero no los editan; el conductor no entra", async ({ page }) => {
  test.setTimeout(240_000);
  const base = `/t/${a.slug}`;

  // Despachador: ve clientes y flota, sin formularios de alta, y SÍ puede crear viajes.
  await login(page, dispatcher.email, dispatcher.password);
  await open(page, `${base}/customers`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(`Cliente A ${a.stamp}`).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar cliente" })).toHaveCount(0);
  await open(page, `${base}/fleet`);
  await expect(page.getByRole("button", { name: "Agregar vehículo" })).toHaveCount(0);
  await open(page, `${base}/trips/new`);
  await expect(page).toHaveURL(new RegExp(`${base}/trips/new`));
  // La ficha del cliente no ofrece el acceso al portal (solo propietario y administrador).
  await open(page, `${base}/customers/${aCustomerId}`);
  await expect(page.getByRole("button", { name: "Dar acceso" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desactivar cliente" })).toHaveCount(0);

  // Seguridad: consulta los catálogos, pero no crea viajes (vuelve a su inicio).
  await login(page, safety.email, safety.password);
  await open(page, `${base}/customers`);
  await expect(page.getByRole("button", { name: "Agregar cliente" })).toHaveCount(0);
  await open(page, `${base}/trips/new`);
  await expect(page).not.toHaveURL(/\/trips\/new/);

  // Conductor: ningún catálogo; cada intento lo devuelve a su app.
  await login(page, driver.email, driver.password);
  for (const path of ["customers", "fleet", "locations", "services", "trips/new"]) {
    await open(page, `${base}/${path}`);
    await expect(page, `el conductor no debe ver /${path}`).toHaveURL(new RegExp(`${base}/driver`));
  }
});

test("ACCESS-002 el propietario ve el acceso al portal y operaciones no", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, a.ops.email, a.ops.password);
  await open(page, `/t/${a.slug}/customers/${aCustomerId}`);
  await expect(page.getByRole("button", { name: "Desactivar cliente" })).toBeVisible(); // operaciones sí gestiona catálogos
  await expect(page.getByRole("button", { name: "Dar acceso" })).toHaveCount(0); // pero no el portal

  await login(page, a.owner.email, a.owner.password);
  await open(page, `/t/${a.slug}/customers/${aCustomerId}`);
  await expect(page.getByRole("button", { name: "Dar acceso" })).toBeVisible();
});

test("ACCESS-003 un usuario de una empresa no ve ni abre datos de otra", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, a.ops.email, a.ops.password);

  // Las pantallas de la otra empresa no se abren (vuelve al inicio de sesión) y nada de B aparece.
  for (const path of ["customers", "fleet", "locations", "services", "trips/new"]) {
    await open(page, `/t/${b.slug}/${path}`);
    await expect(page, `/t/${b.slug}/${path} no debe abrirse`).not.toHaveURL(new RegExp(`/t/${b.slug}/`));
    await expect(page.locator("body")).not.toContainText("SECRETO");
  }

  // Un id de B dentro de la ruta de A es "no existe", no "prohibido": no se confirma que exista.
  for (const path of [
    `customers/${bCustomerId}`,
    `fleet/vehicles/${bVehicleId}`,
    `locations/${bLocationId}`,
    `services/${bServiceTypeId}`,
  ]) {
    // Con streaming Next responde 200 y pinta la página 404: se comprueba el contenido, no el código HTTP.
    await open(page, `/t/${a.slug}/${path}`);
    await expect(page.getByRole("heading", { name: "Página no encontrada" }), `/t/${a.slug}/${path}`).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(bCustomerName);
    await expect(page.locator("body")).not.toContainText("SECRETO");
  }

  // La búsqueda de A no encuentra datos de B, ni siquiera con el nombre exacto.
  await open(page, `/t/${a.slug}/customers?q=${encodeURIComponent("SECRETO")}&estado=todos`);
  await expect(page.getByRole("main").getByText("Sin resultados").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(bCustomerName);
});

test("ACCESS-004 el límite del plan se explica, y reactivar no lo esquiva", async ({ page }) => {
  test.setTimeout(300_000);
  const base = `/t/${a.slug}`;
  await login(page, a.ops.email, a.ops.password);

  // Plan DEMO: 3 clientes activos. Ya hay 1; se agregan 2 más y el cuarto se rechaza con una explicación.
  for (const name of [`Cliente Dos ${a.stamp}`, `Cliente Tres ${a.stamp}`]) {
    await open(page, `${base}/customers`);
    await page.getByRole("textbox", { name: "Nombre o razón social" }).fill(name);
    await page.getByRole("button", { name: "Agregar cliente" }).click();
    await expect(page.getByText(`Cliente «${name}» creado`)).toBeVisible({ timeout: 30_000 });
  }
  await open(page, `${base}/customers`);
  await expect(page.getByRole("main").getByText("Límite alcanzado").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Nombre o razón social" }).fill(`Cliente Cuatro ${a.stamp}`);
  await page.getByRole("button", { name: "Agregar cliente" }).click();
  await expect(page.getByText(/permite hasta 3 clientes y ya tiene 3/)).toBeVisible({ timeout: 30_000 });
  expect(await db.customerAccount.count({ where: { tenantId: a.id } })).toBe(3);
  // Lo escrito sigue ahí para corregirlo después de ampliar el plan.
  await expect(page.getByRole("textbox", { name: "Nombre o razón social" })).toHaveValue(`Cliente Cuatro ${a.stamp}`);

  // Desactivar uno libera cupo: el cuarto ya entra…
  await open(page, `${base}/customers/${aCustomerId}`);
  await page.getByRole("button", { name: "Desactivar cliente" }).click();
  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(page.getByText(/Cliente desactivado/)).toBeVisible({ timeout: 30_000 });
  await open(page, `${base}/customers`);
  await page.getByRole("textbox", { name: "Nombre o razón social" }).fill(`Cliente Cuatro ${a.stamp}`);
  await page.getByRole("button", { name: "Agregar cliente" }).click();
  await expect(page.getByText(`Cliente «Cliente Cuatro ${a.stamp}» creado`)).toBeVisible({ timeout: 30_000 });

  // …y reactivar el primero ya no cabe: sigue inactivo y el aviso lo explica.
  await open(page, `${base}/customers/${aCustomerId}`);
  await page.getByRole("button", { name: "Reactivar cliente" }).click();
  await page.getByRole("button", { name: /Sí, reactivar/ }).click();
  await expect(page.getByText(/plan ya alcanzó el máximo de clientes activos/)).toBeVisible({ timeout: 30_000 });
  expect((await db.customerAccount.findUniqueOrThrow({ where: { id: aCustomerId } })).active).toBe(false);
  expect(await db.customerAccount.count({ where: { tenantId: a.id, active: true } })).toBe(3);
});
