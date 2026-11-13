import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { isLocalDbHost, parseDbTarget } from "../lib/db-target";
import { decryptFile, sha256File } from "./crypto";
import { type BackupEntry, loadManifest } from "./manifest";
import {
  buildPgCommand,
  parsePgConnection,
  resolveToolsMode,
  runPg,
  type PgCommand,
} from "./pg-tools";

export interface RestoreResult {
  type: "postgres";
  success: boolean;
  database: string;
  tableCount: number;
  error?: string;
}

/** Donde se restaura el dump. Siempre es un Postgres local y descartable, nunca la base viva. */
interface RestoreTarget {
  /** Sentencia administrativa (DROP/CREATE DATABASE) sobre la base `postgres`. */
  admin(sql: string): Promise<void>;
  /** Carga el dump SQL en `database`. */
  load(database: string, sqlFile: string): Promise<void>;
  /** Resultado de un SELECT escalar sobre `database`. */
  scalar(database: string, sql: string): Promise<string>;
}

/** Por defecto: el contenedor `postgres` de Docker Compose (comportamiento original). */
function composeTarget(): RestoreTarget {
  const cwd = process.env.PROJECT_ROOT || process.cwd();
  const psql = (database: string, extra: string[]): PgCommand => ({
    command: "docker",
    args: [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "nci",
      "-d",
      database,
      ...extra,
    ],
    env: process.env,
    cwd,
    secrets: [],
  });
  return {
    admin: async (sql) => void (await runPg(psql("postgres", ["-c", sql]))),
    load: async (database, sqlFile) =>
      void (await runPg(psql(database, []), { stdinFile: sqlFile })),
    scalar: async (database, sql) =>
      (await runPg(psql(database, ["-t", "-c", sql]))).stdout.trim(),
  };
}

/**
 * Con `RESTORE_DATABASE_URL`: un Postgres local y descartable (por ejemplo `postgres:17-alpine`
 * en Docker) con un rol que pueda crear bases. Se rechaza cualquier host que no sea local: el
 * restore usa `DROP DATABASE`/`--clean` y nunca debe tocar Supabase. Aqui el dump se carga con
 * `ON_ERROR_STOP`, para que un restore con errores falle en vez de pasar en silencio.
 */
function urlTarget(databaseUrl: string): RestoreTarget {
  const connection = parsePgConnection(databaseUrl, "RESTORE_DATABASE_URL");
  const target = parseDbTarget(databaseUrl);
  if (!target || !isLocalDbHost(target)) {
    throw new Error(
      "RESTORE_DATABASE_URL debe apuntar a un Postgres local y descartable (localhost, 127.0.0.1, postgres). " +
        "El drill de restore nunca corre contra una base remota.",
    );
  }
  const mode = resolveToolsMode();
  const psql = (database: string, extra: string[]) =>
    buildPgCommand(
      "psql",
      ["-X", "-v", "ON_ERROR_STOP=1", ...extra],
      { ...connection, database },
      mode,
    );
  return {
    admin: async (sql) => void (await runPg(psql("postgres", ["-c", sql]))),
    load: async (database, sqlFile) =>
      void (await runPg(psql(database, []), { stdinFile: sqlFile })),
    scalar: async (database, sql) =>
      (await runPg(psql(database, ["-t", "-A", "-c", sql]))).stdout.trim(),
  };
}

function resolveTarget(): RestoreTarget {
  const url = process.env.RESTORE_DATABASE_URL;
  return url ? urlTarget(url) : composeTarget();
}

const PROTECTED_DATABASES = ["postgres", "nci_logistics"];

export async function restorePostgres(
  backupDir: string,
  entry: BackupEntry,
  options: { targetDb?: string; verify?: boolean } = {},
): Promise<RestoreResult> {
  const targetDb = options.targetDb || "nci_logistics_restore_test";
  if (
    !/^[a-z][a-z0-9_]*$/.test(targetDb) ||
    PROTECTED_DATABASES.includes(targetDb)
  ) {
    throw new Error(
      `Invalid restore target database '${targetDb}' — restore only targets isolated test databases`,
    );
  }
  // Se valida el destino antes de descifrar: una configuracion mala no debe dejar un dump en claro.
  const target = resolveTarget();
  const encFile = join(backupDir, entry.filename);
  const sqlFile = encFile.replace(/\.enc$/, "");

  console.log(`[postgres-restore] Decrypting ${entry.filename}...`);

  const encSha256 = await sha256File(encFile);
  if (encSha256 !== entry.encryptedSha256) {
    throw new Error(
      `Encrypted file checksum mismatch: expected ${entry.encryptedSha256.slice(0, 16)}..., got ${encSha256.slice(0, 16)}...`,
    );
  }

  await decryptFile(encFile, sqlFile);

  const sha256 = await sha256File(sqlFile);
  if (sha256 !== entry.sha256) {
    await unlink(sqlFile);
    throw new Error(
      `Decrypted file checksum mismatch: expected ${entry.sha256.slice(0, 16)}..., got ${sha256.slice(0, 16)}...`,
    );
  }

  const sqlStats = await stat(sqlFile);
  console.log(
    `[postgres-restore] Decrypted: ${(sqlStats.size / 1024).toFixed(1)} KB, checksum verified`,
  );

  try {
    console.log(
      `[postgres-restore] Creating isolated database '${targetDb}'...`,
    );
    await target.admin(`DROP DATABASE IF EXISTS ${targetDb};`);
    await target.admin(`CREATE DATABASE ${targetDb};`);

    console.log(`[postgres-restore] Restoring to '${targetDb}'...`);
    await target.load(targetDb, sqlFile);

    const countOutput = await target.scalar(
      targetDb,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
    );

    const tableCount = parseInt(countOutput, 10);
    console.log(
      `[postgres-restore] Restored ${tableCount} tables to '${targetDb}'`,
    );

    if (options.verify !== false) {
      console.log("[postgres-restore] Verifying critical tables...");
      const criticalTables = [
        "users",
        "tenants",
        "sessions",
        "trips",
        "service_requests",
        "audit_logs",
      ];
      for (const table of criticalTables) {
        const count = await target
          .scalar(targetDb, `SELECT count(*) FROM ${table};`)
          .then((output) => parseInt(output, 10))
          .catch(() => -1);
        if (count < 0) {
          console.log(
            `  [WARN] Table '${table}' not found in restored database`,
          );
        } else {
          console.log(`  [OK] ${table}: ${count} rows`);
        }
      }
    }

    console.log(`[postgres-restore] Dropping test database '${targetDb}'...`);
    await target.admin(`DROP DATABASE IF EXISTS ${targetDb};`);

    return { type: "postgres", success: true, database: targetDb, tableCount };
  } finally {
    await unlink(sqlFile).catch(() => {});
  }
}

/**
 * Uso: `pnpm backup:restore:postgres <directorio-de-backup>`. Restaura la entrada postgres del
 * manifiesto en una base aislada (`nci_logistics_restore_test`), la verifica y la elimina.
 * Con RESTORE_DATABASE_URL apunta a un Postgres local descartable; sin ella usa Docker Compose.
 */
if (require.main === module) {
  config({ path: ".env.local" });
  const dir = process.argv[2];
  if (!dir) {
    console.error(
      "Usage: tsx scripts/backup/postgres-restore.ts <backup-directory>",
    );
    process.exit(1);
  }
  loadManifest(join(dir, "manifest.json"))
    .then((manifest) => {
      const entry = manifest.entries.find(
        (candidate) => candidate.type === "postgres",
      );
      if (!entry)
        throw new Error("El manifiesto no tiene una entrada postgres");
      return restorePostgres(dir, entry);
    })
    .then((result) => {
      console.log(
        `[postgres-restore] OK: ${result.tableCount} tablas restauradas`,
      );
    })
    .catch((error) => {
      console.error(
        `[postgres-restore] Fallo: ${error instanceof Error ? error.message : "error desconocido"}`,
      );
      process.exit(1);
    });
}
