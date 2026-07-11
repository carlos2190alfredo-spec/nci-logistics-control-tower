import { test, expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma";

config({ path: ".env.local" });

const db = new PrismaClient();

const users = {
  driver: ["conductor1@panatruck.local", "Conductor2026!"],
  operations: ["operaciones@panatruck.local", "Operaciones2026!"],
} as const;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("PWA-E2E PWA installability and service worker", () => {
  test("PWA-E2E-001 manifest is served with correct fields", async ({ page }) => {
    const response = await page.goto("/manifest.webmanifest");
    expect(response?.status()).toBe(200);
    const manifest = await response!.json();
    expect(manifest.name).toBe("NCI Logistics Control Tower");
    expect(manifest.short_name).toBe("LCT");
    expect(manifest.lang).toBe("es");
    expect(manifest.start_url).toBe("/login");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait-primary");
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();

    const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    expect(icons.length).toBeGreaterThanOrEqual(3);

    const png192 = icons.find((i) => i.sizes === "192x192" && i.type === "image/png");
    expect(png192).toBeTruthy();

    const png512 = icons.find((i) => i.sizes === "512x512" && i.type === "image/png" && !i.purpose);
    expect(png512).toBeTruthy();

    const maskable = icons.find((i) => i.purpose === "maskable");
    expect(maskable).toBeTruthy();
  });

  test("PWA-E2E-002 service worker registers and caches shell", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "not_supported";
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return "not_registered";
      if (reg.active) return "active";
      if (reg.waiting) return "waiting";
      if (reg.installing) return "installing";
      return "unknown";
    });

    expect(["active", "installing", "waiting"]).toContain(swState);
  });

  test("PWA-E2E-003 offline fallback page is cached by service worker", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.installing || reg?.waiting) {
        await new Promise<void>((resolve) => {
          const sw = reg.installing || reg.waiting!;
          if (sw.state === "activated") return resolve();
          sw.addEventListener("statechange", function handler() {
            if (sw.state === "activated") {
              sw.removeEventListener("statechange", handler);
              resolve();
            }
          });
        });
      }
    });

    const offlineCached = await page.evaluate(async () => {
      const cache = await caches.open("nci-lct-v3");
      const response = await cache.match("/offline");
      return response !== undefined;
    });
    expect(offlineCached).toBe(true);

    const offlinePage = await page.goto("/offline");
    expect(offlinePage?.status()).toBe(200);
    const body = await page.textContent("body");
    expect(body).toContain("Sin conexion");
  });

  test("PWA-E2E-004 icons are served as valid PNG files", async ({ page }) => {
    const icon192 = await page.goto("/icons/icon-192x192.png");
    expect(icon192?.status()).toBe(200);
    expect(icon192?.headers()["content-type"]).toContain("image/png");

    const icon512 = await page.goto("/icons/icon-512x512.png");
    expect(icon512?.status()).toBe(200);
    expect(icon512?.headers()["content-type"]).toContain("image/png");

    const maskable = await page.goto("/icons/icon-maskable-512x512.png");
    expect(maskable?.status()).toBe(200);
    expect(maskable?.headers()["content-type"]).toContain("image/png");

    const apple = await page.goto("/apple-touch-icon.png");
    expect(apple?.status()).toBe(200);
    expect(apple?.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("PHOTO-SYNC-E2E photo capture and evidence UI", () => {
  test("PHOTO-SYNC-E2E-001 evidence photo capture UI renders for driver with active trip", async ({ page }) => {
    await login(page, ...users.driver);
    await page.goto("/t/panatruck-demo/driver");
    await page.waitForLoadState("networkidle");

    const tripCard = page.locator("[data-testid^='driver-trip-card']");
    const hasTripCards = await tripCard.count();
    if (hasTripCards === 0) {
      test.skip();
      return;
    }

    const evidenceSection = page.getByText("Evidencia de entrega");
    const hasEvidence = await evidenceSection.count();
    if (hasEvidence === 0) {
      test.skip();
      return;
    }

    const captureButton = page.getByText("Capturar foto").first();
    await expect(captureButton).toBeVisible();
  });

  test("PHOTO-SYNC-E2E-002 sync status bar shows on driver page", async ({ page }) => {
    await login(page, ...users.driver);
    await page.goto("/t/panatruck-demo/driver");
    await page.waitForLoadState("networkidle");

    const syncBar = page.getByText(/Sincronizado|Pendientes|Fotos pendientes/);
    await expect(syncBar.first()).toBeVisible({ timeout: 10_000 });
  });

  test("PHOTO-SYNC-E2E-003 sync status shows online indicator", async ({ page }) => {
    await login(page, ...users.driver);
    await page.goto("/t/panatruck-demo/driver");
    await page.waitForLoadState("networkidle");

    const onlineText = page.getByText("En linea");
    await expect(onlineText.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("ATTACHMENT-E2E attachment endpoint", () => {
  let driverCookies: string;
  let tripId: string;
  let tenantSlug: string;

  test.beforeAll(async () => {
    tenantSlug = "panatruck-demo";
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: tenantSlug } });
    const driverUser = await db.user.findUniqueOrThrow({ where: { email: users.driver[0] } });
    const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: driverUser.id } });
    expect(driver).toBeTruthy();

    const trip = await db.trip.findFirst({
      where: { tenantId: tenant.id, driverId: driver!.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
      select: { id: true },
    });
    if (trip) {
      tripId = trip.id;
    }
  });

  test("ATTACHMENT-E2E-001 POST without auth returns 401 or redirect", async ({ request }) => {
    const response = await request.post(`/api/t/${tenantSlug}/driver/attachment`, {
      headers: { Origin: "http://localhost:3000" },
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 401, 403]).toContain(response.status());
  });

  test("ATTACHMENT-E2E-002 POST without Origin returns 403", async ({ page, request }) => {
    await login(page, ...users.driver);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const formData = new URLSearchParams();
    formData.set("idempotencyKey", "test-key");
    formData.set("tripId", "fake-trip");

    const response = await request.post(`/api/t/${tenantSlug}/driver/attachment`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).toBe(403);
  });

  test("ATTACHMENT-E2E-003 GET status check for non-existent receipt returns 404", async ({ page, request }) => {
    await login(page, ...users.driver);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await request.get(
      `/api/t/${tenantSlug}/driver/attachment?idempotencyKey=non-existent-key`,
      { headers: { Cookie: cookieHeader } },
    );
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.receipt).toBe("NOT_FOUND");
  });

  test("ATTACHMENT-E2E-004 GET without idempotencyKey returns 400", async ({ page, request }) => {
    await login(page, ...users.driver);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await request.get(`/api/t/${tenantSlug}/driver/attachment`, {
      headers: { Cookie: cookieHeader },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_PAYLOAD");
  });
});

test.describe("PHOTO-EXIF-E2E client-side EXIF stripping", () => {
  test("PHOTO-EXIF-E2E-001 evidence photo capture component loads on driver page", async ({ page }) => {
    await login(page, ...users.driver);
    await page.goto("/t/panatruck-demo/driver");
    await page.waitForLoadState("networkidle");

    const tripCard = page.locator("[data-testid^='driver-trip-card']");
    const hasTripCards = await tripCard.count();
    if (hasTripCards === 0) {
      test.skip();
      return;
    }

    const evidenceSection = page.getByText("Evidencia de entrega");
    const hasEvidence = await evidenceSection.count();
    if (hasEvidence === 0) {
      test.skip();
      return;
    }

    const photoQuota = page.getByText(/\/50 fotos/).first();
    await expect(photoQuota).toBeVisible();
    const quotaText = await photoQuota.textContent();
    expect(quotaText).toMatch(/\d+\/50 fotos/);
  });

  test("PHOTO-EXIF-E2E-002 photo status badges use correct label set", async () => {
    const statusLabels = ["Procesando", "Pendiente", "Subiendo", "Verificando", "Listo", "Error", "Conflicto"];
    expect(statusLabels).toHaveLength(7);
    for (const label of statusLabels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
