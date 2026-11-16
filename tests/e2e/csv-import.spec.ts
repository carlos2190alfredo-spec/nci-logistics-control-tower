import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/** ADR-038 — importacion CSV de catalogos con un tenant descartable. */

config({ path: ".env.local" });

const db = new PrismaClient();
let tenant: ThrowawayTenant;
const tag = String(Date.now()).slice(-6);

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tenant = await createThrowawayTenant(db);
});
test.afterAll(async () => {
  if (tenant) await destroyThrowawayTenant(db, tenant);
  await db.$disconnect();
});

async function openPanel(page: Page, path: string, summary: RegExp) {
  await page.goto(`/t/${tenant.slug}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByText(summary).click();
  return page.getByTestId("csv-import-panel");
}

test("CSV-001 vehículos desde un CSV de Excel (Windows-1252, punto y coma): vista previa, importación y reimportación", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, tenant.ops.email, tenant.ops.password);
  const panel = await openPanel(page, "/fleet?vista=vehiculos", /Importar vehículos desde un archivo/);

  // "Camión rígido" con tilde en Windows-1252 (lo que guarda Excel en español con "CSV" a secas).
  const csv = `Placa;Unidad;Tipo\nZZ${tag}A;U-${tag}A;Camión rígido\nZZ${tag}B;U-${tag}B;Tracto camión\nZZ${tag}B;U-${tag}C;Repetida\n`;
  await panel.locator('input[type="file"]').setInputFiles({ name: "vehiculos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") });

  await expect(panel.getByText("2 filas listas · 1 con problemas")).toBeVisible();
  await expect(panel.getByText(/Windows-1252/)).toBeVisible();
  await expect(panel.getByText(/Repetido/)).toBeVisible();
  await panel.getByRole("button", { name: "Importar 2 filas" }).click();
  await expect(page.getByText("Se importaron 2 vehículos.")).toBeVisible({ timeout: 30_000 });

  const rows = await db.vehicle.findMany({ where: { tenantId: tenant.id }, orderBy: { plate: "asc" } });
  expect(rows.map((row) => row.plate)).toEqual([`ZZ${tag}A`, `ZZ${tag}B`]);
  expect(rows[0].type).toBe("Camión rígido"); // las tildes sobreviven a la codificación de Excel
  expect(rows.every((row) => row.status === "AVAILABLE")).toBe(true);

  // Reimportar el mismo archivo no duplica nada.
  await page.goto(`/t/${tenant.slug}/fleet?vista=vehiculos`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByText(/Importar vehículos desde un archivo/).click();
  await page.getByTestId("csv-import-panel").locator('input[type="file"]').setInputFiles({ name: "vehiculos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") });
  await page.getByRole("button", { name: /^Importar \d+ filas?$/ }).click();
  await expect(page.getByText(/No se importó nada/)).toBeVisible({ timeout: 30_000 });
  expect(await db.vehicle.count({ where: { tenantId: tenant.id } })).toBe(2);
});

test("CSV-002 un .xlsx y un archivo sin la columna obligatoria se explican en la vista previa", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, tenant.ops.email, tenant.ops.password);
  const panel = await openPanel(page, "/customers", /Importar clientes desde un archivo/);
  await panel.locator('input[type="file"]').setInputFiles({ name: "clientes.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]) });
  await expect(panel.getByText(/CSV UTF-8/)).toBeVisible();

  await panel.locator('input[type="file"]').setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from("Telefono,Correo\n6000-0000,a@x.com\n") });
  await expect(panel.getByText(/Nombre/).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: /Importar/ })).toBeDisabled();
});
