import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Pruebas con base de datos REAL (`pnpm test:db`, ADR-038). Aparte de `vitest.config.ts` a propósito: la suite
 * normal (`pnpm test`) nunca toca una base de datos. Estas pruebas solo corren contra la base local de Docker
 * (la guarda de `scripts/lib/db-test-guard.ts` lo exige) y crean/borran tenants `zz-db-*`.
 *
 * Los archivos corren uno tras otro: comparten la base y varias pruebas llenan tablas o fuerzan carreras.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
