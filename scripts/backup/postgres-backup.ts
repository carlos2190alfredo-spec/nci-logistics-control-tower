import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { encryptFile, sha256File } from "./crypto";
import { type BackupEntry, type BackupManifest, addEntry } from "./manifest";
import {
  buildPgCommand,
  parsePgConnection,
  resolveToolsMode,
  runPg,
  type PgCommand,
} from "./pg-tools";

/** Por defecto el dump sale del contenedor local de Docker Compose (comportamiento original). */
function localComposeDump(): {
  command: PgCommand;
  metadata: BackupEntry["metadata"];
} {
  return {
    command: {
      command: "docker",
      args: [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "nci",
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
        "nci_logistics",
      ],
      env: process.env,
      cwd: process.env.PROJECT_ROOT || process.cwd(),
      secrets: [],
    },
    metadata: { database: "nci_logistics", user: "nci" },
  };
}

/**
 * Con `BACKUP_DATABASE_URL` el dump sale de esa base (Supabase en staging/produccion), con el
 * pg_dump local si existe o con `docker run postgres:17-alpine pg_dump`. La URL solo viaja por
 * variables de entorno. Debe ser la conexion de sesion (:5432), no el pooler transaccional (:6543).
 * Se limita al esquema `public`: el rol de la app no puede leer los esquemas internos de Supabase.
 */
function remoteDump(databaseUrl: string): {
  command: PgCommand;
  metadata: BackupEntry["metadata"];
} {
  const connection = parsePgConnection(databaseUrl, "BACKUP_DATABASE_URL");
  const mode = resolveToolsMode();
  console.log(
    `[postgres] Source: ${connection.host}:${connection.port}/${connection.database} (pg_dump: ${mode})`,
  );
  return {
    command: buildPgCommand(
      "pg_dump",
      [
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
        "--schema=public",
      ],
      connection,
      mode,
    ),
    // Sin usuario ni contrasena: el manifiesto no va cifrado.
    metadata: {
      database: connection.database,
      host: connection.host,
      source: "remote",
      schema: "public",
      pgTools: mode,
    },
  };
}

export async function backupPostgres(
  backupDir: string,
  manifest: BackupManifest,
): Promise<void> {
  const stamp = manifest.createdAt
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const dumpFile = join(backupDir, `postgres-${stamp}.sql`);
  const encFile = `${dumpFile}.enc`;

  const remoteUrl = process.env.BACKUP_DATABASE_URL;
  const { command, metadata } = remoteUrl
    ? remoteDump(remoteUrl)
    : localComposeDump();

  console.log("[postgres] Running pg_dump...");

  let originalSize: number;
  let sha256: string;
  let iv: string;
  let authTag: string;
  try {
    await runPg(command, { stdoutFile: dumpFile });

    const dumpStats = await stat(dumpFile);
    if (dumpStats.size === 0) {
      throw new Error("pg_dump produced an empty file — backup aborted");
    }
    originalSize = dumpStats.size;

    sha256 = await sha256File(dumpFile);
    console.log(
      `[postgres] Dump: ${(dumpStats.size / 1024).toFixed(1)} KB, SHA-256: ${sha256.slice(0, 16)}...`,
    );

    console.log("[postgres] Encrypting...");
    ({ iv, authTag } = await encryptFile(dumpFile, encFile));
  } finally {
    // Nunca queda un dump en claro en disco, ni siquiera cuando el dump o el cifrado fallan.
    await unlink(dumpFile).catch(() => undefined);
  }

  const encStats = await stat(encFile);
  const encSha256 = await sha256File(encFile);

  const entry: BackupEntry = {
    filename: `postgres-${stamp}.sql.enc`,
    type: "postgres",
    originalSize,
    encryptedSize: encStats.size,
    sha256,
    encryptedSha256: encSha256,
    iv,
    authTag,
    metadata,
  };

  addEntry(manifest, entry);
  console.log(`[postgres] Encrypted: ${(encStats.size / 1024).toFixed(1)} KB`);
}
