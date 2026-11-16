import type { AppEnv } from "../../src/lib/app-env";
import { formatDbTarget, isLocalDbHost, parseDbTarget, type DbTarget } from "./db-target";

/**
 * Guarda de las pruebas con base de datos real (`pnpm test:db`, ADR-038).
 *
 * Esas pruebas CREAN y BORRAN tenants descartables (`zz-db-*`) y llenan tablas para forzar límites y
 * concurrencia: nunca deben correr contra staging ni producción. La decisión es pura (se prueba en
 * `db-test-guard.test.ts`, dentro de la suite normal); `tests/db/helpers/db.ts` solo hace la E/S.
 *
 * Falla cerrado: cualquier duda (URL ilegible, host remoto, pooler, perfil distinto de `local`, nombre de
 * base que sugiera staging o producción) bloquea la ejecución.
 */

export type TestDbGuardResult = { ok: true; target: DbTarget } | { ok: false; reason: string };

/** Nombres de base que nunca se usan para pruebas destructivas, aunque el host sea local (p. ej. un túnel). */
const FORBIDDEN_DATABASE_NAME = /(^|[^a-z])(prod|production|staging|live)([^a-z]|$)/i;

export function evaluateTestDbGuard(input: { databaseUrl: string | undefined; appEnv: AppEnv }): TestDbGuardResult {
  const target = parseDbTarget(input.databaseUrl);
  if (!target) return { ok: false, reason: "DATABASE_URL no está definida o no es una URL de Postgres válida." };

  const where = formatDbTarget(target);
  if (input.appEnv !== "local") {
    return { ok: false, reason: `Solo corre con APP_ENV=local (actual: ${input.appEnv}; destino ${where}).` };
  }
  if (!isLocalDbHost(target)) {
    return { ok: false, reason: `El destino ${where} no es local. Estas pruebas solo corren contra la base local de Docker.` };
  }
  if (target.pgbouncer) {
    return { ok: false, reason: `El destino ${where} usa un pooler (pgbouncer): no sirve para pruebas con transacciones largas.` };
  }
  if (FORBIDDEN_DATABASE_NAME.test(target.database)) {
    return { ok: false, reason: `El nombre de base "${target.database}" sugiere staging o producción.` };
  }
  return { ok: true, target };
}
