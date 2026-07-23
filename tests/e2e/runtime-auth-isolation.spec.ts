import { expect, test, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { PrismaClient } from "../../src/generated/prisma";

const db = new PrismaClient();

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany({
    where: { scope: { in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login"] } },
  });
});

const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const MFA_USERS = new Set(["platform@nci.local", "owner@panatruck.local", "owner@translogistica.local"]);

const users = {
  platform: ["platform@nci.local", "NCIPlatform2026!"],
  panatruckOwner: ["owner@panatruck.local", "PanatruckOwner2026!"],
  panatruckOperations: ["operaciones@panatruck.local", "Operaciones2026!"],
  panatruckDriver: ["conductor1@panatruck.local", "Conductor2026!"],
  panatruckCustomer: ["cliente@clienteportuario.local", "Cliente2026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
  transCustomer: ["cliente@distribuciones.local", "Distribuciones2026!"],
} as const;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await Promise.all([
    page.waitForURL((u) => u.pathname !== "/login", { timeout: 15_000 }),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);

  if (MFA_USERS.has(email) && page.url().includes("/mfa/verify")) {
    const totp = new TOTP({ secret: SEED_TOTP_SECRET, algorithm: "SHA1", digits: 6, period: 30 });
    await page.getByLabel("Codigo de verificacion").fill(totp.generate());
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/mfa/verify"), { timeout: 15_000 }),
      page.getByRole("button", { name: "Verificar" }).click(),
    ]);
  }
}

test("platform user can access platform dashboard and logout", async ({ page }) => {
  await login(page, ...users.platform);
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("heading", { name: "Panel de Plataforma" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Panatruck Demo")).toBeVisible();
  await expect(page.getByRole("table").getByText("TransLogistica Demo")).toBeVisible();

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("tenant users are isolated by tenant membership", async ({ browser }) => {
  const panContext = await browser.newContext();
  const panPage = await panContext.newPage();
  await login(panPage, ...users.panatruckOwner);
  await expect(panPage).toHaveURL(/\/t\/panatruck-demo$/);
  await expect(panPage.getByRole("heading", { name: "Panatruck Demo" })).toBeVisible();
  await panPage.goto("/t/translogistica-demo");
  await expect(panPage).toHaveURL(/\/login$/);
  await expect(panPage.getByText("TransLogistica Demo - Centro de Control")).toHaveCount(0);
  await panContext.close();

  const transContext = await browser.newContext();
  const transPage = await transContext.newPage();
  await login(transPage, ...users.transOwner);
  await expect(transPage).toHaveURL(/\/t\/translogistica-demo$/);
  await expect(transPage.getByRole("heading", { name: "TransLogistica Demo" })).toBeVisible();
  await transPage.goto("/t/panatruck-demo");
  await expect(transPage).toHaveURL(/\/login$/);
  await expect(transPage.getByText("Cliente Portuario Panama")).toHaveCount(0);
  await transContext.close();
});

test("customer users are routed to their portal and cannot cross tenants", async ({ browser }) => {
  const panContext = await browser.newContext();
  const panPage = await panContext.newPage();
  await login(panPage, ...users.panatruckCustomer);
  await expect(panPage).toHaveURL(/\/t\/panatruck-demo\/portal$/);
  await expect(panPage.getByRole("heading", { name: "Panatruck Demo - Portal Cliente" })).toBeVisible();
  await expect(panPage.getByText("Cliente Portuario Panama")).toBeVisible();
  await expect(panPage.getByText("Aviacion del Istmo")).toHaveCount(0);
  await expect(panPage.getByText("Industrias del Pacifico")).toHaveCount(0);
  await panPage.goto("/t/translogistica-demo/portal");
  await expect(panPage).toHaveURL(/\/login$/);
  await expect(panPage.getByText("Distribuciones Nacionales Demo")).toHaveCount(0);
  await panContext.close();

  const transContext = await browser.newContext();
  const transPage = await transContext.newPage();
  await login(transPage, ...users.transCustomer);
  await expect(transPage).toHaveURL(/\/t\/translogistica-demo\/portal$/);
  await expect(transPage.getByText("Distribuciones Nacionales Demo")).toBeVisible();
  await transPage.goto("/t/panatruck-demo/portal");
  await expect(transPage).toHaveURL(/\/login$/);
  await expect(transPage.getByText("Cliente Portuario Panama")).toHaveCount(0);
  await transContext.close();
});

test("driver sees assigned trips only", async ({ page }) => {
  await login(page, ...users.panatruckDriver);
  await page.goto("/t/panatruck-demo/driver");
  await expect(page.getByRole("heading", { name: "Panatruck Demo - App Conductor" })).toBeVisible();
  await expect(page.getByText("PANATRUCK-DEMO-TR-0001")).toBeVisible();
  await expect(page.getByText("PANATRUCK-DEMO-TR-0006")).toBeVisible();
  await expect(page.getByText("PANATRUCK-DEMO-TR-0002")).toHaveCount(0);
});

test("operations dashboard, customer portal, and navigation load", async ({ page }) => {
  await login(page, ...users.panatruckOperations);
  await expect(page).toHaveURL(/\/t\/panatruck-demo$/);
  await expect(page.getByText("Mapa y seguimiento").first()).toBeVisible();
  await page.getByRole("link", { name: "Portal cliente" }).click();
  await expect(page).toHaveURL(/\/t\/panatruck-demo$/);
  await expect(page.getByText("Cliente Portuario Panama - CUSTOMER_ADMIN")).toHaveCount(0);
});
