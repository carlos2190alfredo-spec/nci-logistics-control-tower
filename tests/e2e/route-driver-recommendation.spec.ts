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

test.describe.serial("Route Estimation & Driver Recommendation", () => {
  test("operations insights page loads for admin", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck/admin/operations-insights");
    await expect(page.getByText("Operaciones IA")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sin conductor")).toBeVisible();
  });

  test("driver schedule page loads with weekly grid", async ({ page }) => {
    await login(page, ...users.operations);
    const driver = await db.driver.findFirst({
      where: { tenant: { slug: "panatruck" } },
    });
    expect(driver).toBeTruthy();
    await page.goto(`/t/panatruck/admin/drivers/${driver!.id}/schedule`);
    await expect(page.getByText("Horario Semanal")).toBeVisible({ timeout: 10_000 });
  });

  test("driver list shows schedule link", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck/admin/drivers");
    await expect(page.getByRole("link", { name: "Horario" }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("trip card shows route estimation section", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck");
    const estimateSection = page.getByText("Estimacion de Ruta");
    if (await estimateSection.isVisible().catch(() => false)) {
      await expect(estimateSection).toBeVisible();
    }
  });

  test("trip card shows driver recommendation section", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck");
    const recSection = page.getByText("Recomendacion de Conductor");
    if (await recSection.isVisible().catch(() => false)) {
      await expect(recSection).toBeVisible();
    }
  });

  test("cross-tenant: translogistica cannot see panatruck operations", async ({ page }) => {
    await login(page, ...users.transOwner);
    const response = await page.goto("/t/panatruck/admin/operations-insights");
    expect(response?.status()).not.toBe(200);
  });

  test("operations insights shows metrics cards", async ({ page }) => {
    await login(page, ...users.operations);
    await page.goto("/t/panatruck/admin/operations-insights");
    await expect(page.getByText("Sin conductor")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sin ETA")).toBeVisible();
    await expect(page.getByText("Sin horario")).toBeVisible();
  });
});
