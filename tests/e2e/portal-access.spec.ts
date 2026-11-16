import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { deleteMailTo, mailCount, waitForMail } from "./helpers/mailpit";
import { createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/** ADR-038 — acceso de un cliente al portal: alta por el propietario, correo de un solo uso, aislamiento y desactivacion. */

config({ path: ".env.local" });

const db = new PrismaClient();
let tenant: ThrowawayTenant;
let customerId: string;
const NEW_PASSWORD = "Portal-E2E-2026-Nueva!";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tenant = await createThrowawayTenant(db);
  const customer = await db.customerAccount.create({ data: { tenantId: tenant.id, code: "CLI-0001", name: `Cliente Portal ${tenant.stamp}` } });
  customerId = customer.id;
});
test.afterAll(async () => {
  if (tenant) {
    await deleteMailTo(`cliente-${tenant.stamp}@e2e.local`);
    await destroyThrowawayTenant(db, tenant);
  }
  await db.$disconnect();
});

test("PORTAL-001 el propietario da acceso, la persona crea su contraseña con el enlace y entra a su portal", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `cliente-${tenant.stamp}@e2e.local`;
  await login(page, tenant.owner.email, tenant.owner.password);
  await page.goto(`/t/${tenant.slug}/customers/${customerId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await page.getByRole("textbox", { name: "Nombre de la persona" }).fill("Ana Cliente");
  await page.getByRole("textbox", { name: "Correo de acceso" }).fill(email);
  await page.getByRole("button", { name: "Dar acceso" }).click();
  await expect(page.getByText(/Acceso creado/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(/portal-user-row-/)).toHaveCount(1);

  // Correo de un solo uso: enlace de /recuperar, sin contraseña en el cuerpo.
  const mail = await waitForMail(email);
  const link = mail.text.match(/https?:\/\/[^\s]+\/recuperar\/[A-Za-z0-9_-]+/)?.[0];
  expect(link, "el correo debe traer el enlace para crear la contraseña").toBeTruthy();
  expect(mail.html + mail.text).not.toMatch(/contrase(ñ|n)a:\s*\S+/i);

  // La persona abre el enlace y define su contraseña.
  const guest = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await guest.goto(link!.replace(/^https?:\/\/[^/]+/, ""), { waitUntil: "domcontentloaded" });
  await guest.waitForLoadState("networkidle");
  await guest.getByLabel("Nueva contrasena", { exact: false }).first().fill(NEW_PASSWORD);
  await guest.getByLabel("Confirmar contrasena").fill(NEW_PASSWORD);
  await guest.getByRole("button", { name: "Cambiar contrasena" }).click();
  await guest.waitForURL(/\/login/, { timeout: 30_000 });
  await login(guest, email, NEW_PASSWORD);
  await expect(guest).toHaveURL(new RegExp(`/t/${tenant.slug}/portal`));

  // Desactivar el acceso la deja fuera del portal; reactivar el cliente no lo reactiva solo.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Desactivar acceso" }).click();
  await page.getByRole("button", { name: "Sí, desactivar" }).click();
  await expect(page.getByText("Acceso desactivado. La persona ya no puede entrar al portal.")).toBeVisible({ timeout: 30_000 });
  await guest.goto(`/t/${tenant.slug}/portal`, { waitUntil: "domcontentloaded" });
  await expect(guest).not.toHaveURL(/\/portal$/);
  await guest.context().close();
});

test("PORTAL-002 un correo con cuenta en otro lugar, de plataforma o del equipo no se vincula en silencio", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, tenant.owner.email, tenant.owner.password);
  await page.goto(`/t/${tenant.slug}/customers/${customerId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const before = await db.customerMembership.count({ where: { tenantId: tenant.id } });
  const platformMailsBefore = await mailCount("platform@nci.local");

  // Correos con cuenta existente que NO son de este tenant: el seed trae el de plataforma y el de otro tenant.
  for (const email of ["platform@nci.local", "owner@panatruck.local"]) {
    await page.getByRole("textbox", { name: "Nombre de la persona" }).fill("Alguien");
    await page.getByRole("textbox", { name: "Correo de acceso" }).fill(email);
    await page.getByRole("button", { name: "Dar acceso" }).click();
    await expect(page.getByText("No se pudo dar acceso con ese correo. Use otro correo o contacte a soporte de NCI.").first()).toBeVisible({ timeout: 30_000 });
  }
  // Nada se envia ni se crea para esos correos.
  expect(await mailCount("platform@nci.local")).toBe(platformMailsBefore);

  // Miembro del equipo de este tenant: mensaje local.
  await page.getByRole("textbox", { name: "Correo de acceso" }).fill(tenant.ops.email);
  await page.getByRole("button", { name: "Dar acceso" }).click();
  await expect(page.getByText("Esa persona ya forma parte de su equipo.").first()).toBeVisible({ timeout: 30_000 });

  expect(await db.customerMembership.count({ where: { tenantId: tenant.id } })).toBe(before);
});

test("PORTAL-003 quien no es propietario ni administrador no ve el formulario de acceso", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, tenant.ops.email, tenant.ops.password);
  await page.goto(`/t/${tenant.slug}/customers/${customerId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Solo el propietario o el administrador pueden dar acceso al portal.")).toBeVisible();
  await expect(page.getByTestId("portal-user-form")).toHaveCount(0);
});
