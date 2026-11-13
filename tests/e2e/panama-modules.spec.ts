/**
 * E2E de los módulos Panamá (cumplimiento, contenedores, hazmat, mantenimiento,
 * finanzas) — cubre lo que las verificaciones vía curl ya validaron por HTTP,
 * pero navegando la UI real como haría un usuario.
 */
import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma";
import { login } from "./helpers/auth";

// Reset MFA/login rate-limit buckets antes de CADA test: cada test hace un
// login fresco con MFA y la ventana de rate-limit se agotaría en 5-6 tests.
test.beforeEach(async () => {
  const db = new PrismaClient();
  try {
    await db.rateLimitBucket.deleteMany({
      where: { scope: { in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login"] } },
    });
  } finally {
    await db.$disconnect();
  }
});


const users = {
  panatruckOwner: ["owner@panatruck.local", "PanatruckOwner2026!"],
  panatruckOperations: ["operaciones@panatruck.local", "Operaciones2026!"],
  transOwner: ["owner@translogistica.local", "TransLogistica2026!"],
} as const;

test.describe("Panamá — cumplimiento", () => {
  test("owner ve el semáforo y la lista de documentos", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/compliance");
    await expect(page.getByRole("heading", { name: /Cumplimiento y documentos/ })).toBeVisible();
    await expect(page.getByText(/Semáforo:/)).toBeVisible();
    // El seed inyecta un seguro VENCIDO bloqueante → aparece "Vencido" en la tabla.
    await expect(page.getByRole("cell", { name: /Vencido/i }).first()).toBeVisible();
    // Aviso obligatorio de validación humana visible.
    await expect(page.getByText(/no sustituye a las autoridades/i)).toBeVisible();
  });

  test("el enlace al reporte PDF apunta a la ruta correcta", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/compliance");
    const link = page.locator("a[href='/api/t/panatruck-demo/compliance/report.pdf']");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("download", "");
    await expect(link).toContainText(/Reporte PDF/);
  });
});

test.describe("Panamá — contenedores", () => {
  test("owner ve el listado con badges de riesgo de detention", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/containers");
    await expect(page.getByRole("heading", { name: /Contenedores/ }).first()).toBeVisible();
    // El seed inyecta CT-0001 con detention acumulándose.
    await expect(page.getByText(/PANATRUCK-DEMO-CT-0001/)).toBeVisible();
    await expect(page.getByText(/Cargo acumul/).first()).toBeVisible();
  });
});

test.describe("Panamá — hazmat", () => {
  test("owner ve órdenes con estado de cumplimiento", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/hazmat");
    await expect(page.getByRole("heading", { name: /Combustible y mercancías peligrosas/ })).toBeVisible();
    // El seed inyecta HZ-0001 Jet-A (CUMPLE) y HZ-0002 Diesel (NO CUMPLE).
    await expect(page.getByText(/PANATRUCK-DEMO-HZ-0001/)).toBeVisible();
    await expect(page.getByText(/PANATRUCK-DEMO-HZ-0002/)).toBeVisible();
    // Disclaimer visible: la IA no autoriza despachos.
    await expect(page.getByText(/la IA no autoriza despachos/)).toBeVisible();
  });
});

test.describe("Panamá — mantenimiento", () => {
  test("owner ve equipos bloqueados y órdenes en progreso", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/maintenance");
    await expect(page.getByRole("heading", { name: /Mantenimiento de flota/ })).toBeVisible();
    // El seed inyecta VH-2 con orden EN_PROGRESO bloqueante.
    await expect(page.getByText(/Reparacion de frenos/)).toBeVisible();
    await expect(page.getByText(/En progreso/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Equipos bloqueados/ })).toBeVisible();
  });

  test("los selects de asignación deshabilitan el vehículo en mantenimiento", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, ...users.panatruckOwner);
    // Pre-warm de la ruta: la primera compilación de /trips en dev puede tardar
    // más que el timeout por defecto. Un fetch previo cuenta con la sesión ya
    // establecida y calienta el bundle sin tumbar el server.
    await page.request.get("/t/panatruck-demo/trips", { timeout: 120_000 });
    await page.goto("/t/panatruck-demo/trips", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // La orden de mantenimiento del seed marca VH-2 con el sufijo
    // "· en mantenimiento" y disabled=true en el HTML.
    const disabledVh2 = page.locator(
      "select[name='vehicleId'] option[disabled]:has-text('mantenimiento')",
    );
    await expect(disabledVh2.first()).toHaveText(/VH-2/);
  });
});

test.describe("Panamá — finanzas (OWNER only)", () => {
  test("owner ve totales y desgloses por dimensión", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/finance");
    await expect(page.getByRole("heading", { name: /Rentabilidad/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ingresos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Por cliente/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Por ruta/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Por conductor/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Por equipo/ })).toBeVisible();
  });

  test("owner ve el enlace al PDF financiero apuntando a la ruta correcta", async ({ page }) => {
    await login(page, ...users.panatruckOwner);
    await page.goto("/t/panatruck-demo/finance");
    const link = page.locator("a[href='/api/t/panatruck-demo/finance/report.pdf']");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("download", "");
    await expect(link).toContainText(/Reporte PDF/);
  });

  test("operaciones NO puede acceder a la página de finanzas (RBAC)", async ({ page }) => {
    await login(page, ...users.panatruckOperations);
    // requireTenantRole redirige a /t/{slug} cuando falta el rol.
    await page.goto("/t/panatruck-demo/finance");
    await page.waitForURL((u) => !u.pathname.endsWith("/finance"), { timeout: 10_000 });
    // El heading "Rentabilidad" NO debe verse en la página resultante.
    await expect(page.getByRole("heading", { name: /^Rentabilidad$/ })).toHaveCount(0);
  });
});

test.describe("Panamá — aislamiento por tenant en los módulos nuevos", () => {
  test("un owner de un tenant no puede ver /compliance de otro tenant", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, ...users.panatruckOwner);
    // Intento cruzar tenant → redirige a /login (guard multitenant).
    await page.goto("/t/translogistica-demo/compliance");
    await expect(page).toHaveURL(/\/login$/);
    await ctx.close();
  });
});
