import { expect, test, type BrowserContext } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";
import { hashPassword } from "../../src/lib/server/crypto";
import { encryptSecret } from "../../src/lib/server/mfa-crypto";
import { login } from "./helpers/auth";

config({ path: ".env.local" });

const db = new PrismaClient();

const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const testUser = { email: `sec-e2e-${Date.now()}@nci.local`, password: "InitialTest2026!" };

async function ensureUser(email: string, password: string) {
  const user = await db.user.upsert({
    where: { email },
    update: { active: true, passwordHash: await hashPassword(password), platformRole: "PLATFORM_SUPER_ADMIN" },
    create: { email, name: "Auth Security Test", passwordHash: await hashPassword(password), platformRole: "PLATFORM_SUPER_ADMIN" },
  });
  const { encrypted, iv, authTag } = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.upsert({
    where: { userId: user.id },
    update: { encryptedSecret: encrypted, iv, authTag, verified: true, verifiedAt: new Date() },
    create: { userId: user.id, encryptedSecret: encrypted, iv, authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });
  return user;
}

test.describe.serial("SEC-AUTH session rotation and management", () => {
  let firstContext: BrowserContext;
  let secondContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    await ensureUser(testUser.email, testUser.password);
    firstContext = await browser.newContext();
    secondContext = await browser.newContext();
  });

  test.afterAll(async () => {
    await firstContext.close();
    await secondContext.close();
  });

  test("SEC-AUTH-001 login revoca la sesion previa del mismo navegador (session fixation)", async () => {
    const page = await firstContext.newPage();
    await login(page, testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/platform$/);

    const cookies = await firstContext.cookies();
    const previousCookie = cookies.find((cookie) => cookie.name === "nci_lct_session");
    expect(previousCookie).toBeTruthy();

    // Nuevo login desde el mismo contexto: rota la cookie previa.
    await login(page, testUser.email, testUser.password);
    const newCookies = await firstContext.cookies();
    const newCookie = newCookies.find((cookie) => cookie.name === "nci_lct_session");
    expect(newCookie?.value).not.toBe(previousCookie?.value);

    // Reintenta la sesion previa: debe estar rechazada.
    const stalePage = await firstContext.newPage();
    await stalePage.context().clearCookies();
    await stalePage.context().addCookies([{ ...previousCookie!, value: previousCookie!.value }]);
    await stalePage.goto("/platform");
    await expect(stalePage).toHaveURL(/\/login/);
    await page.close();
    await stalePage.close();
  });

  test("SEC-AUTH-002 recuperar contrasena responde igual exista o no el correo", async () => {
    const page = await secondContext.newPage();

    await page.goto("/recuperar");
    await page.getByLabel("Correo").fill("no-existe@nci.local");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Solicitud recibida")).toBeVisible({ timeout: 10_000 });

    // El correo existente puede tomar segundos por SMTP a Mailpit; damos margen.
    await page.goto("/recuperar");
    await page.getByLabel("Correo").fill(testUser.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Solicitud recibida")).toBeVisible({ timeout: 15_000 });
    await page.close();
  });

  test("SEC-AUTH-003 reset con token valido invalida todas las sesiones", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, testUser.email, testUser.password);

    // Emitimos un token en DB manualmente y consumimos por URL.
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const user = await db.user.findUniqueOrThrow({ where: { email: testUser.email } });
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      },
    });

    const resetPage = await context.newPage();
    await resetPage.goto(`/recuperar/${token}`);
    const newPass = "PostResetPass2026!";
    await resetPage.getByLabel("Nueva contrasena").fill(newPass);
    await resetPage.getByLabel("Confirmar contrasena").fill(newPass);
    await resetPage.getByRole("button", { name: "Cambiar contrasena" }).click();
    await resetPage.waitForURL(/\/login/, { timeout: 20_000 });

    // La sesion original quedo invalidada — la primera pagina redirige a login.
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login/);

    // Restauramos la contrasena original para no afectar otros tests.
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(testUser.password) } });
    await context.close();
  });

  test("SEC-AUTH-004 gestion de sesiones lista y permite cerrar todas las demas", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await login(pageA, testUser.email, testUser.password);
    await login(pageB, testUser.email, testUser.password);

    await pageA.goto("/account/sessions");
    await expect(pageA.getByText("Sesion actual")).toBeVisible();

    await pageA.getByRole("button", { name: "Cerrar todas las demas" }).click();
    await pageA.waitForLoadState("networkidle");

    // Pagina B queda invalidada.
    await pageB.goto("/platform");
    await expect(pageB).toHaveURL(/\/login/);
    await contextA.close();
    await contextB.close();
  });
});
