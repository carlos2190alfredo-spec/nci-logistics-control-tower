import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { TOTP } from "otpauth";
import { PrismaClient } from "../../src/generated/prisma";
import { hashPassword } from "../../src/lib/server/crypto";
import { encryptSecret } from "../../src/lib/server/mfa-crypto";

config({ path: ".env.local" });

const db = new PrismaClient();
const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const adminEmail = `obs-admin-${Date.now()}@nci.local`;
const driverEmail = `obs-driver-${Date.now()}@nci.local`;
const adminPass = "ObsAdmin2026!";
const driverPass = "ObsDriver2026!";

async function loginWithMfa(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/mfa/verify")) {
    const totp = new TOTP({ secret: SEED_TOTP_SECRET, algorithm: "SHA1", digits: 6, period: 30 });
    await page.getByLabel("Codigo de verificacion").fill(totp.generate());
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/mfa/"), { timeout: 15000 });
    await page.waitForLoadState("networkidle");
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const adminUser = await db.user.upsert({
    where: { email: adminEmail },
    update: { active: true, passwordHash: await hashPassword(adminPass), platformRole: "PLATFORM_SUPER_ADMIN" },
    create: { email: adminEmail, name: "Obs Admin", passwordHash: await hashPassword(adminPass), platformRole: "PLATFORM_SUPER_ADMIN" },
  });
  const { encrypted, iv, authTag } = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.upsert({
    where: { userId: adminUser.id },
    update: { encryptedSecret: encrypted, iv, authTag, verified: true, verifiedAt: new Date() },
    create: { userId: adminUser.id, encryptedSecret: encrypted, iv, authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });

  const tenant = await db.tenant.findFirst();
  if (tenant) {
    const driverUser = await db.user.upsert({
      where: { email: driverEmail },
      update: { active: true, passwordHash: await hashPassword(driverPass) },
      create: { email: driverEmail, name: "Obs Driver", passwordHash: await hashPassword(driverPass) },
    });
    await db.tenantMembership.upsert({
      where: { tenantId_userId_role: { tenantId: tenant.id, userId: driverUser.id, role: "DRIVER" } },
      update: {},
      create: { userId: driverUser.id, tenantId: tenant.id, role: "DRIVER" },
    });
  }
});

test.afterAll(async () => {
  await db.session.deleteMany({ where: { user: { email: { in: [adminEmail, driverEmail] } } } });
  await db.userMfaSecret.deleteMany({ where: { user: { email: adminEmail } } });
  const tenant = await db.tenant.findFirst();
  if (tenant) {
    await db.tenantMembership.deleteMany({ where: { user: { email: driverEmail }, tenantId: tenant.id } });
  }
  await db.user.deleteMany({ where: { email: { in: [adminEmail, driverEmail] } } });
  await db.$disconnect();
});

test("OBS-E2E-001: /api/internal/health returns status without details", async ({ request }) => {
  const res = await request.get("/api/internal/health");
  const body = await res.json();
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("checkedAt");
  expect(body).not.toHaveProperty("checks");
  expect(body).not.toHaveProperty("durationMs");
});

test("OBS-E2E-002: /api/internal/liveness returns alive:true", async ({ request }) => {
  const res = await request.get("/api/internal/liveness");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.alive).toBe(true);
});

test("OBS-E2E-003: /api/internal/readiness returns 403 without auth", async ({ request }) => {
  const res = await request.get("/api/internal/readiness");
  expect([403, 307]).toContain(res.status());
});

test("OBS-E2E-004: /api/internal/metrics returns 403 without auth", async ({ request }) => {
  const res = await request.get("/api/internal/metrics");
  expect([403, 307]).toContain(res.status());
});

test("OBS-E2E-005: system-status page requires authentication", async ({ page }) => {
  await page.goto("/platform/system-status");
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain("/login");
});

test("OBS-E2E-006: system-status page accessible by PLATFORM_SUPER_ADMIN", async ({ page }) => {
  await loginWithMfa(page, adminEmail, adminPass);
  await page.goto("/platform/system-status");
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain("/platform/system-status");
  await expect(page.getByRole("heading", { name: "Estado del Sistema" })).toBeVisible();
  await expect(page.getByText("Estado general")).toBeVisible();
});

test("OBS-E2E-007: system-status page shows service health table", async ({ page }) => {
  await loginWithMfa(page, adminEmail, adminPass);
  await page.goto("/platform/system-status");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h2").filter({ hasText: "Servicios" })).toBeVisible();
  await expect(page.getByText("postgresql")).toBeVisible();
});

test("OBS-E2E-008: health response includes X-Request-ID header", async ({ request }) => {
  const res = await request.get("/api/internal/health");
  const reqId = res.headers()["x-request-id"];
  expect(reqId).toBeTruthy();
  expect(reqId.length).toBeGreaterThan(0);
  expect(reqId.length).toBeLessThanOrEqual(64);
});

test("OBS-E2E-009: PWA telemetry rejects non-DRIVER requests", async ({ request }) => {
  const tenant = await db.tenant.findFirst();
  if (!tenant) {
    test.skip();
    return;
  }
  const res = await request.post(`/api/t/${tenant.slug}/driver/pwa-telemetry`, {
    headers: { "content-type": "application/json" },
    data: { pendingCommandCount: 0 },
  });
  expect([401, 403, 307]).toContain(res.status());
});

test("OBS-E2E-010: platform page has link to Estado del sistema", async ({ page }) => {
  await loginWithMfa(page, adminEmail, adminPass);
  await page.goto("/platform");
  await page.waitForLoadState("networkidle");
  const link = page.getByRole("link", { name: "Estado del sistema" });
  await expect(link).toBeVisible();
});
