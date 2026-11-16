import { test, expect } from "@playwright/test";
import argon2 from "argon2";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";
import { deleteMailTo, waitForMail } from "./helpers/mailpit";
import { createThrowawayTenant, destroyThrowawayTenant, type ThrowawayTenant } from "./helpers/tenant-factory";

/** ADR-038 — invitaciones al equipo: el enlace del correo ya lleva a una página que funciona. */

config({ path: ".env.local" });

const db = new PrismaClient();
let tenant: ThrowawayTenant;
const NEW_PASSWORD = "Equipo-E2E-2026-Nueva!";
const EXISTING_PASSWORD = "Equipo-E2E-2026-Existente!";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tenant = await createThrowawayTenant(db);
});
test.afterAll(async () => {
  if (tenant) {
    await deleteMailTo(`nuevo-${tenant.stamp}@e2e.local`);
    await deleteMailTo(`existente-${tenant.stamp}@e2e.local`);
    await db.userInvitation.deleteMany({ where: { tenantId: tenant.id } });
    await destroyThrowawayTenant(db, tenant);
  }
  await db.$disconnect();
});

async function sendInvitation(page: import("@playwright/test").Page, email: string, role: string) {
  await page.goto(`/t/${tenant.slug}/admin/invitations`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Correo electronico/).fill(email);
  await page.getByLabel(/^Rol/).selectOption({ label: role });
  await page.getByRole("button", { name: "Enviar invitacion" }).click();
  await expect(page.getByText("Invitacion enviada.")).toBeVisible({ timeout: 30_000 });
}

async function invitationLink(email: string) {
  const mail = await waitForMail(email);
  const link = mail.text.match(/https?:\/\/[^\s]+\/invitacion\/[A-Za-z0-9_-]+/)?.[0];
  expect(link, "el correo debe traer el enlace de la invitación").toBeTruthy();
  return link!.replace(/^https?:\/\/[^/]+/, "");
}

test("INV-001 el propietario invita, la persona crea su cuenta con el enlace y entra a la empresa; el enlace no se reutiliza", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `nuevo-${tenant.stamp}@e2e.local`;
  await login(page, tenant.owner.email, tenant.owner.password);
  await sendInvitation(page, email, "Despachador");
  const path = await invitationLink(email);

  const guest = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await guest.goto(path, { waitUntil: "domcontentloaded" });
  await guest.waitForLoadState("networkidle");
  const main = guest.getByRole("main");
  await expect(main.getByRole("heading", { name: "Invitación al equipo" })).toBeVisible();
  await expect(main.getByText(email).first()).toBeVisible();
  await expect(main.getByText("Despachador").first()).toBeVisible();

  // Datos inválidos: el navegador y el servidor lo rechazan sin gastar el enlace.
  await main.getByRole("textbox", { name: /Su nombre/ }).fill("Luis Despacho");
  await main.getByLabel(/^Contraseña/).fill(NEW_PASSWORD);
  await main.getByLabel(/^Confirmar contraseña/).fill(`${NEW_PASSWORD}-distinta`);
  await main.getByRole("button", { name: "Crear mi cuenta y aceptar" }).click();
  await expect(main.getByText("Las contraseñas no coinciden.")).toBeVisible({ timeout: 30_000 });

  // Lo escrito sobrevive al error: solo se corrige la confirmación.
  await expect(main.getByRole("textbox", { name: /Su nombre/ })).toHaveValue("Luis Despacho");
  await expect(main.getByLabel(/^Contraseña/)).toHaveValue(NEW_PASSWORD);
  await main.getByLabel(/^Confirmar contraseña/).fill(NEW_PASSWORD);
  await main.getByRole("button", { name: "Crear mi cuenta y aceptar" }).click();
  await guest.waitForURL(/\/login\?invitation=ok/, { timeout: 30_000 });
  await expect(guest.getByText("Cuenta creada").first()).toBeVisible();

  await login(guest, email, NEW_PASSWORD);
  await expect(guest).toHaveURL(new RegExp(`/t/${tenant.slug}`));

  // El enlace ya no sirve.
  await guest.goto(path, { waitUntil: "domcontentloaded" });
  await expect(guest.getByRole("main").getByText(/ya fue utilizada/)).toBeVisible();
  await guest.context().close();

  const membership = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, user: { email } }, include: { user: true } });
  expect(membership).toMatchObject({ role: "DISPATCHER", active: true });
  expect(membership.user.emailVerified).toBe(true);
});

test("INV-002 una cuenta que ya existe solo acepta con su propia sesión", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `existente-${tenant.stamp}@e2e.local`;
  await db.user.create({
    data: { name: "Marta Existente", email, passwordHash: await argon2.hash(EXISTING_PASSWORD, { type: argon2.argon2id }), emailVerified: true },
  });
  await login(page, tenant.owner.email, tenant.owner.password);
  await sendInvitation(page, email, "Conductor");
  const path = await invitationLink(email);

  // Sin sesión: no se une con solo tener el enlace.
  const guest = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await guest.goto(path, { waitUntil: "domcontentloaded" });
  await guest.waitForLoadState("networkidle");
  const main = guest.getByRole("main");
  await expect(main.getByText(/Ya existe una cuenta con este correo/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Aceptar invitación" })).toHaveCount(0);
  expect(await db.tenantMembership.count({ where: { tenantId: tenant.id, user: { email } } })).toBe(0);

  // El enlace de la propia página lleva al login y VUELVE a la invitación; con su sesión acepta con un clic.
  const loginHref = await main.getByRole("link", { name: "Iniciar sesión", exact: true }).getAttribute("href");
  expect(loginHref).toBe(`/login?next=${encodeURIComponent(path)}`);
  await login(guest, email, EXISTING_PASSWORD, { path: loginHref! });
  await expect(guest).toHaveURL(new RegExp(`${path}$`));
  await guest.waitForLoadState("networkidle");
  await guest.getByRole("main").getByRole("button", { name: "Aceptar invitación" }).click();
  await guest.waitForURL(new RegExp(`/t/${tenant.slug}`), { timeout: 30_000 });
  const membership = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: tenant.id, user: { email } } });
  expect(membership).toMatchObject({ role: "DRIVER", active: true });
  await guest.context().close();
});

test("INV-003 un enlace inventado o vencido se explica sin revelar nada", async ({ browser }) => {
  const guest = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  await guest.goto("/invitacion/token-que-no-existe-0123456789abcdef", { waitUntil: "domcontentloaded" });
  await expect(guest.getByRole("main").getByText("Enlace no válido")).toBeVisible();
  await guest.goto("/invitacion/x", { waitUntil: "domcontentloaded" });
  await expect(guest.getByRole("main").getByText("Enlace no válido")).toBeVisible();
  await guest.context().close();
});
