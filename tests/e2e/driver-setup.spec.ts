import argon2 from "argon2";
import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/** ADR-038 — alta de conductor sin pantalla de error, vinculo con su cuenta y alcance de la app del conductor. */

config({ path: ".env.local" });

const db = new PrismaClient();
let tenant: ThrowawayTenant;
const PASSWORD = "Driver-E2E-2026-Pass!";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  tenant = await createThrowawayTenant(db);
});
test.afterAll(async () => {
  if (tenant) await destroyThrowawayTenant(db, tenant);
  await db.$disconnect();
});

test("DRV-001 errores amables, vínculo con la cuenta y un conductor sin ficha no ve viajes", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await login(page, tenant.ops.email, tenant.ops.password);

  // Dato invalido y codigo repetido: vuelven al formulario con aviso (no a la pagina de error).
  const fill = async (code: string) => {
    await page.goto(`/t/${tenant.slug}/admin/drivers/new`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: "Nombre completo" }).fill("Pedro E2E");
    await page.getByRole("textbox", { name: "Codigo" }).fill(code);
    await page.getByRole("textbox", { name: "Numero de licencia" }).fill("LIC-1");
    await page.getByRole("button", { name: "Crear conductor" }).click();
  };
  await fill("X");
  await expect(page.getByText(/Revise los datos/)).toBeVisible({ timeout: 30_000 });
  await fill("ZZ-DRV-1");
  await page.waitForURL(/\/admin\/drivers$/, { timeout: 30_000 });
  await fill("ZZ-DRV-1");
  await expect(page.getByText("Ya existe un conductor con ese código. Use otro.")).toBeVisible({ timeout: 30_000 });

  // Cuenta con rol Conductor, vinculada desde la ficha.
  const account = await db.user.create({
    data: { name: "Pedro Cuenta", email: `driver-${tenant.stamp}@e2e.local`, passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }), emailVerified: true },
  });
  await db.tenantMembership.create({ data: { tenantId: tenant.id, userId: account.id, role: "DRIVER" } });
  const driver = await db.driver.findFirstOrThrow({ where: { tenantId: tenant.id, code: "ZZ-DRV-1" } });

  // Un viaje activo de OTRO conductor: el conductor sin ficha NO debe verlo.
  const customer = await db.customerAccount.create({ data: { tenantId: tenant.id, code: "CLI-0001", name: "Cliente DRV" } });
  const type = await db.serviceType.findFirstOrThrow({ where: { tenantId: tenant.id, code: "GENERAL" } });
  const other = await db.driver.create({ data: { tenantId: tenant.id, code: "ZZ-DRV-2", name: "Otro", license: "L2" } });
  await db.trip.create({
    data: { tenantId: tenant.id, customerAccountId: customer.id, serviceTypeId: type.id, driverId: other.id, reference: `ZZ-${tenant.stamp}-TR-0001`, status: "ASSIGNED", origin: "Origen secreto ZZ", destination: "Destino ZZ", scheduledAt: new Date(Date.now() + 86_400_000) },
  });

  const driverPage = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await login(driverPage, account.email, PASSWORD);
  await driverPage.goto(`/t/${tenant.slug}/driver`, { waitUntil: "domcontentloaded" });
  await driverPage.waitForLoadState("networkidle");
  await expect(driverPage.getByText("Origen secreto ZZ")).toHaveCount(0);

  await page.goto(`/t/${tenant.slug}/admin/drivers/${driver.id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Cuenta del conductor" }).selectOption({ label: `Pedro Cuenta (${account.email})` });
  await page.getByRole("button", { name: "Guardar vínculo" }).click();
  await expect(page.getByText("Cuenta vinculada. El conductor ya ve sus viajes en la app.")).toBeVisible({ timeout: 30_000 });
  expect((await db.driver.findUniqueOrThrow({ where: { id: driver.id } })).userId).toBe(account.id);
  await driverPage.context().close();
});
