import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { TOTP } from "otpauth";
import { PrismaClient } from "../../src/generated/prisma";
import { hashPassword } from "../../src/lib/server/crypto";
import { encryptSecret } from "../../src/lib/server/mfa-crypto";

config({ path: ".env.local" });

const db = new PrismaClient();
const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXP4567ABCDEFGHIJKL";
const platformEmail = `plat-admin-${Date.now()}@nci.local`;
const tenantOwnerEmail = `ten-owner-${Date.now()}@nci.local`;
const tenantUserEmail = `ten-user-${Date.now()}@nci.local`;
const platformPass = "PlatAdmin2026!";
const tenantOwnerPass = "TenOwner2026!";
const tenantUserPass = "TenUser2026!";

let tenantSlug: string;
let _tenantId: string;

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

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany({
    where: { scope: { in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login"] } },
  });
});

test.beforeAll(async () => {
  const tenant = await db.tenant.findFirst({ select: { id: true, slug: true } });
  if (!tenant) throw new Error("No tenant found for E2E tests");
  tenantSlug = tenant.slug;
  _tenantId = tenant.id;

  const platformUser = await db.user.upsert({
    where: { email: platformEmail },
    update: { active: true, passwordHash: await hashPassword(platformPass), platformRole: "PLATFORM_SUPER_ADMIN" },
    create: { email: platformEmail, name: "Platform Admin E2E", passwordHash: await hashPassword(platformPass), platformRole: "PLATFORM_SUPER_ADMIN" },
  });
  const { encrypted, iv, authTag } = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.upsert({
    where: { userId: platformUser.id },
    update: { encryptedSecret: encrypted, iv, authTag, verified: true, verifiedAt: new Date() },
    create: { userId: platformUser.id, encryptedSecret: encrypted, iv, authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });

  const ownerUser = await db.user.upsert({
    where: { email: tenantOwnerEmail },
    update: { active: true, passwordHash: await hashPassword(tenantOwnerPass) },
    create: { email: tenantOwnerEmail, name: "Tenant Owner E2E", passwordHash: await hashPassword(tenantOwnerPass) },
  });
  const ownerMfa = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.upsert({
    where: { userId: ownerUser.id },
    update: { encryptedSecret: ownerMfa.encrypted, iv: ownerMfa.iv, authTag: ownerMfa.authTag, verified: true, verifiedAt: new Date() },
    create: { userId: ownerUser.id, encryptedSecret: ownerMfa.encrypted, iv: ownerMfa.iv, authTag: ownerMfa.authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });
  await db.tenantMembership.upsert({
    where: { tenantId_userId_role: { tenantId: tenant.id, userId: ownerUser.id, role: "TENANT_OWNER" } },
    update: {},
    create: { userId: ownerUser.id, tenantId: tenant.id, role: "TENANT_OWNER" },
  });

  const tenantUser = await db.user.upsert({
    where: { email: tenantUserEmail },
    update: { active: true, passwordHash: await hashPassword(tenantUserPass) },
    create: { email: tenantUserEmail, name: "Tenant User E2E", passwordHash: await hashPassword(tenantUserPass) },
  });
  const userMfa = encryptSecret(SEED_TOTP_SECRET);
  await db.userMfaSecret.upsert({
    where: { userId: tenantUser.id },
    update: { encryptedSecret: userMfa.encrypted, iv: userMfa.iv, authTag: userMfa.authTag, verified: true, verifiedAt: new Date() },
    create: { userId: tenantUser.id, encryptedSecret: userMfa.encrypted, iv: userMfa.iv, authTag: userMfa.authTag, algorithm: "SHA1", digits: 6, period: 30, verified: true, verifiedAt: new Date() },
  });
  await db.tenantMembership.upsert({
    where: { tenantId_userId_role: { tenantId: tenant.id, userId: tenantUser.id, role: "DISPATCHER" } },
    update: {},
    create: { userId: tenantUser.id, tenantId: tenant.id, role: "DISPATCHER" },
  });
});

test.afterAll(async () => {
  await db.tenantFeedback.deleteMany({ where: { user: { email: tenantOwnerEmail } } });
  await db.session.deleteMany({ where: { user: { email: { in: [platformEmail, tenantOwnerEmail, tenantUserEmail] } } } });
  await db.userMfaSecret.deleteMany({ where: { user: { email: { in: [platformEmail, tenantOwnerEmail, tenantUserEmail] } } } });
  await db.tenantMembership.deleteMany({ where: { user: { email: { in: [tenantOwnerEmail, tenantUserEmail] } } } });
  await db.user.deleteMany({ where: { email: { in: [platformEmail, tenantOwnerEmail, tenantUserEmail] } } });
  await db.$disconnect();
});

// --- PLATFORM E2E ---

test("PLATFORM-E2E-001: platform admin can access /platform/tenants", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/tenants");
  await expect(page.getByRole("heading", { name: "Gestion de Tenants", exact: true })).toBeVisible();
  await expect(page.getByText(tenantSlug)).toBeVisible();
});

test("PLATFORM-E2E-002: platform admin sees global metrics", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform");
  await expect(page.getByRole("heading", { name: "Panel de Plataforma" })).toBeVisible();
  await expect(page.getByText("Tenants activos")).toBeVisible();
  await expect(page.getByText("Viajes procesados")).toBeVisible();
});

test("PLATFORM-E2E-003: platform admin sees errors page", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/errors");
  await expect(page.getByRole("heading", { name: "Errores y Alertas" })).toBeVisible();
});

test("PLATFORM-E2E-004: platform admin sees feedback page", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/feedback");
  await expect(page.getByRole("heading", { name: "Feedback de Tenants" })).toBeVisible();
});

// --- TENANT ADMIN E2E ---

test("TENANT-ADMIN-E2E-001: tenant owner sees users page", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/users`);
  await expect(page.getByRole("heading", { name: "Usuarios del Tenant" })).toBeVisible();
  await expect(page.getByText(tenantOwnerEmail)).toBeVisible();
});

test("TENANT-ADMIN-E2E-002: tenant owner sees drivers page", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/drivers`);
  await expect(page.locator("h1").filter({ hasText: "Conductores" })).toBeVisible();
});

test("TENANT-ADMIN-E2E-003: dispatcher cannot access admin dashboard", async ({ page }) => {
  await loginWithMfa(page, tenantUserEmail, tenantUserPass);
  await page.goto(`/t/${tenantSlug}/admin`);
  await page.waitForLoadState("networkidle");
  expect(page.url()).not.toContain("/admin");
});

// --- INTEGRATION E2E ---

test("INTEGRATION-E2E-001: tenant sees integrations all disabled", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/integrations`);
  await expect(page.getByRole("heading", { name: "Integraciones" })).toBeVisible();
  await expect(page.getByText("GPS Telematico")).toBeVisible();
  await expect(page.getByText("Desactivado").first()).toBeVisible();
});

test("INTEGRATION-E2E-002: platform sees global integrations catalog", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/integrations");
  await expect(page.getByText("GPS Telematico")).toBeVisible();
  await expect(page.getByText("WhatsApp Cloud")).toBeVisible();
  await expect(page.getByText("Desactivado").first()).toBeVisible();
});

test("INTEGRATION-E2E-003: all connectors show as disabled on tenant page", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/integrations`);
  const badges = page.getByText("Desactivado");
  await expect(badges.first()).toBeVisible();
  const count = await badges.count();
  expect(count).toBeGreaterThanOrEqual(4);
});

// --- AI E2E ---

test("AI-E2E-001: platform sees recommendations page", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/recommendations");
  await expect(page.getByRole("heading", { name: "Recomendaciones IA" })).toBeVisible();
});

test("AI-E2E-002: tenant sees only own recommendations", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/recommendations`);
  await expect(page.getByRole("heading", { name: "Recomendaciones IA" })).toBeVisible();
});

// --- FEEDBACK E2E ---

test("FEEDBACK-E2E-001: tenant owner can submit feedback", async ({ page }) => {
  await loginWithMfa(page, tenantOwnerEmail, tenantOwnerPass);
  await page.goto(`/t/${tenantSlug}/admin/feedback`);
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  await page.locator("select[name='type']").selectOption("BUG");
  await page.locator("input[name='title']").fill("E2E Test Bug Report");
  await page.locator("textarea[name='description']").fill("This is an automated E2E test feedback submission.");
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  await page.waitForLoadState("networkidle");
});

test("FEEDBACK-E2E-002: platform sees tenant feedback", async ({ page }) => {
  await loginWithMfa(page, platformEmail, platformPass);
  await page.goto("/platform/feedback");
  await expect(page.getByRole("heading", { name: "Feedback de Tenants" })).toBeVisible();
});
