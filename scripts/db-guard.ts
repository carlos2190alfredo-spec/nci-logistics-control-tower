/**
 * Guarda de destino para los comandos de package.json que no pasan por un script propio.
 * Uso: `tsx scripts/db-guard.ts <seed|demo|reset>`. Sale con codigo 1 si el destino no esta permitido.
 *
 * `db:reset` lo encadena antes de `prisma migrate reset --force`, que borra la base completa.
 */
import { config } from "dotenv";
// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

import { guardDbTarget, type DbGuardMode } from "./lib/db-target";

const mode = process.argv[2];
if (mode !== "seed" && mode !== "demo" && mode !== "reset") {
  console.error("Uso: tsx scripts/db-guard.ts <seed|demo|reset>");
  process.exit(1);
}

guardDbTarget(mode as DbGuardMode, `db:${mode}`);
