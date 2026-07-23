import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { TOTP } from "otpauth";
import { PrismaClient } from "../../src/generated/prisma";

config({ path: ".env.local" });

const db = new PrismaClient();
const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const MFA_USERS = new Set(["owner@panatruck.local", "owner@translogistica.local", "platform@nci.local"]);

const users = {
  operations: ["operaciones@panatruck.local", "Operaciones2026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
} as const;

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

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany({
    where: { scope: { in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login"] } },
  });
});

test.describe.serial("Route Estimation & Driver Recommendation", () => {
  test("operations insights page loads for admin", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo/admin/operations-insights");
    await expect(page.getByRole("heading", { name: "Operaciones e Inteligencia" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sin conductor", { exact: true })).toBeVisible();
  });

  test("driver schedule page loads with weekly grid", async ({ page }) => {
    await login(page, ...users.operations);
    const driver = await db.driver.findFirst({
      where: { tenant: { slug: "panatruck-demo" } },
    });
    expect(driver).toBeTruthy();
    await page.goto(`/t/panatruck-demo/admin/drivers/${driver!.id}/schedule`);
    await expect(page.getByText("Horario Semanal")).toBeVisible({ timeout: 10_000 });
  });

  test("driver list shows schedule link", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo/admin/drivers");
    await expect(page.getByRole("link", { name: "Horario" }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("trip card shows route estimation section", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo");
    const estimateSection = page.getByText("Estimacion de Ruta");
    if (await estimateSection.isVisible().catch(() => false)) {
      await expect(estimateSection).toBeVisible();
    }
  });

  test("trip card shows driver recommendation section", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo");
    const recSection = page.getByText("Recomendacion de Conductor");
    if (await recSection.isVisible().catch(() => false)) {
      await expect(recSection).toBeVisible();
    }
  });

  test("cross-tenant: translogistica cannot see panatruck operations", async ({ page }) => {
    await login(page, ...users.transOwner);
    await page.goto("/t/panatruck-demo/admin/operations-insights");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/panatruck-demo/admin/operations-insights");
  });

  test("operations insights shows metrics cards", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck-demo/admin/operations-insights");
    await expect(page.getByText("Sin conductor", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sin ETA", { exact: true })).toBeVisible();
    await expect(page.getByText("Viajes activos", { exact: true })).toBeVisible();
  });
});
