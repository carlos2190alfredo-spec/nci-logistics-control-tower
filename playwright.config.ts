import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  // Un worker para evitar condiciones de carrera contra la base de datos local
  // compartida por todas las suites (rate limits, secuencias de asignación).
  workers: 1,
  fullyParallel: false,
  // Ejecución serial de 12 specs + dev server con compilación bajo demanda
  // deja margen para races transitorios (compilación lenta, rate-limits que
  // se agotan entre logins con MFA). Un reintento absorbe estos casos sin
  // ocultar regresiones reales — un test que falla dos veces sí queda rojo.
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
