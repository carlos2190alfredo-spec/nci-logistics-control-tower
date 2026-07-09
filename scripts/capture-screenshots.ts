/**
 * Captura screenshots de las rutas principales por perfil para auditoría visual.
 * Uso: pnpm exec tsx scripts/capture-screenshots.ts <etiqueta>
 * Requiere el dev server activo en http://localhost:3000.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const label = process.argv[2] ?? "capture";
const baseDir = path.join("docs", "ui-audit", label);
const baseURL = "http://localhost:3000";

const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;

const sessions: Array<{
  user: string;
  password: string;
  shots: Array<{ route: string; name: string }>;
}> = [
  {
    user: "platform@nci.local",
    password: "NCIPlatform2026!",
    shots: [{ route: "/platform", name: "platform" }],
  },
  {
    user: "operaciones@panatruck.local",
    password: "Operaciones2026!",
    shots: [
      { route: "/t/panatruck-demo", name: "control-center" },
      { route: "/t/panatruck-demo/driver", name: "driver-as-ops" },
    ],
  },
  {
    user: "owner@panatruck.local",
    password: "PanatruckOwner2026!",
    shots: [{ route: "/t/panatruck-demo/settings", name: "settings" }],
  },
  {
    user: "cliente@clienteportuario.local",
    password: "Cliente2026!",
    shots: [{ route: "/t/panatruck-demo/portal", name: "portal" }],
  },
  {
    user: "conductor1@panatruck.local",
    password: "Conductor2026!",
    shots: [{ route: "/t/panatruck-demo/driver", name: "driver" }],
  },
];

async function login(page: Page, email: string, password: string) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle");
}

async function main() {
  await mkdir(baseDir, { recursive: true });
  const browser = await chromium.launch();

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    for (const route of ["/", "/login"]) {
      await page.goto(`${baseURL}${route}`);
      await page.waitForLoadState("networkidle");
      const name = route === "/" ? "home" : route.replace(/\//g, "");
      await page.screenshot({
        path: path.join(baseDir, `${name}-${viewport.name}.png`),
        fullPage: true,
      });
    }

    for (const session of sessions) {
      await login(page, session.user, session.password);
      for (const shot of session.shots) {
        await page.goto(`${baseURL}${shot.route}`);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: path.join(baseDir, `${shot.name}-${viewport.name}.png`),
          fullPage: true,
        });
      }
      await context.clearCookies();
    }

    await context.close();
  }

  await browser.close();
  console.log(`Screenshots guardados en ${baseDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
