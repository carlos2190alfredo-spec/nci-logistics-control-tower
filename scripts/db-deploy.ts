/**
 * Aplica las migraciones pendientes (`prisma migrate deploy`) con guardas de destino (OPS-03, OPS-07).
 *
 *   pnpm db:deploy              # aplica
 *   pnpm db:deploy --status     # solo informa las migraciones pendientes (`prisma migrate status`)
 *
 * - Imprime el destino (host, puerto y base; nunca usuario ni contrasena).
 * - Un host que no es local exige `CONFIRM_DB_HOST=<host>` igual al host de DATABASE_URL.
 * - Se niega a migrar por un pooler en modo transaccion (puerto 6543 / `pgbouncer=true`): los
 *   bloqueos asesores de Prisma Migrate no funcionan ahi. Use la conexion de sesion (:5432).
 *
 * Orden en produccion (docs/STAGING_DEPLOYMENT.md): migrar ANTES de fusionar el codigo que
 * la necesita, porque cada push a `main` se despliega solo.
 */
import { config } from "dotenv";
// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

import { spawnSync } from "node:child_process";
import { isLocalDbHost, requireConfirmedHost } from "./lib/db-target";

const LABEL = "db:deploy";
const statusOnly = process.argv.includes("--status");

function main(): number {
  const target = requireConfirmedHost(LABEL);

  if (target.pgbouncer || target.port === "6543") {
    console.error(
      `\n[${LABEL}] BLOQUEADO: DATABASE_URL usa el pooler en modo transaccion (puerto ${target.port}` +
        `${target.pgbouncer ? ", pgbouncer=true" : ""}).\n` +
        "prisma migrate necesita una conexion de sesion: use el puerto 5432 sin pgbouncer.\n",
    );
    return 1;
  }

  const command = statusOnly ? "status" : "deploy";
  console.log(`[${LABEL}] Ejecutando: prisma migrate ${command}`);
  // DATABASE_URL viaja por el entorno heredado: nunca por la linea de comandos ni por el log.
  const result = spawnSync("pnpm", ["exec", "prisma", "migrate", command], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(
      `[${LABEL}] No se pudo ejecutar prisma: ${result.error.message}`,
    );
    return 1;
  }
  const code = result.status ?? 1;

  if (code === 0 && !statusOnly && !isLocalDbHost(target)) {
    console.log(
      `\n[${LABEL}] Migraciones aplicadas. Siguiente paso en Supabase: re-ejecutar infra/supabase/harden.sql ` +
        "(idempotente) en el SQL editor, para que las tablas nuevas tengan RLS y no queden expuestas a la Data API.",
    );
  }
  return code;
}

process.exit(main());
