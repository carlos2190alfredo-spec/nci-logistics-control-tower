import { spawn, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { isLocalDbHost, parseDbTarget } from "../lib/db-target";

/**
 * Herramientas de Postgres (`pg_dump`, `psql`) contra una base arbitraria, por ejemplo Supabase (OPS-02).
 *
 * - Usa los binarios locales si existen; si no, `docker run --rm postgres:17-alpine <herramienta>`.
 * - La URL de conexion NUNCA viaja por la linea de comandos ni se imprime: se descompone en
 *   variables `PG*` del entorno del proceso. En Docker se pasan con `-e NOMBRE` (sin valor), que
 *   toma el valor del entorno del cliente `docker`.
 * - Los dumps son SQL plano; se restauran con `psql`, no con `pg_restore`.
 */

/** Misma version mayor que `docker-compose.yml`. pg_dump no puede ser mas viejo que el servidor. */
export const DOCKER_PG_IMAGE = "postgres:17-alpine";

export type PgTool = "pg_dump" | "psql";
export type PgToolsMode = "local" | "docker";

export interface PgConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslmode: string;
}

export interface PgCommand {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  /** Valores que no deben aparecer en mensajes de error. */
  secrets: string[];
}

/**
 * Interpreta una URL de Postgres. Los errores nunca incluyen la URL ni la contrasena.
 * Rechaza el pooler en modo transaccion (puerto 6543 / `pgbouncer=true`): `pg_dump` necesita
 * una conexion de sesion (puerto 5432 o conexion directa).
 */
export function parsePgConnection(
  databaseUrl: string,
  variableName: string,
): PgConnection {
  const target = parseDbTarget(databaseUrl);
  if (!target || target.socket) {
    throw new Error(
      `${variableName} no es una URL de Postgres valida (postgresql://usuario:clave@host:puerto/base).`,
    );
  }
  if (target.pgbouncer || target.port === "6543") {
    throw new Error(
      `${variableName} apunta al pooler en modo transaccion (puerto ${target.port}). ` +
        "Use la conexion de sesion (puerto 5432) o la conexion directa de Supabase.",
    );
  }

  const url = new URL(databaseUrl);
  const user = decodeURIComponent(url.username);
  if (!user) throw new Error(`${variableName} no incluye usuario.`);

  return {
    host: target.host,
    port: target.port,
    user,
    password: decodeURIComponent(url.password),
    database: target.database,
    // Fuera de local se exige TLS salvo que la URL diga otra cosa.
    sslmode:
      url.searchParams.get("sslmode") ??
      (isLocalDbHost(target) ? "prefer" : "require"),
  };
}

export function hasLocalTool(tool: PgTool): boolean {
  return spawnSync(tool, ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * `BACKUP_PG_TOOLS=local|docker` fuerza el modo. Sin valor: binarios locales si estan
 * `pg_dump` y `psql`; si no, Docker.
 */
export function resolveToolsMode(
  preference: string | undefined = process.env.BACKUP_PG_TOOLS,
  localToolAvailable: (tool: PgTool) => boolean = hasLocalTool,
): PgToolsMode {
  if (preference === "local" || preference === "docker") return preference;
  if (preference)
    throw new Error(
      `BACKUP_PG_TOOLS=${JSON.stringify(preference.slice(0, 20))} no es valido: use local o docker.`,
    );
  return localToolAvailable("pg_dump") && localToolAvailable("psql")
    ? "local"
    : "docker";
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** Variables `PG*` de la conexion. Dentro de un contenedor, `localhost` es el propio contenedor. */
export function pgEnv(
  connection: PgConnection,
  mode: PgToolsMode,
): Record<string, string> {
  const host =
    mode === "docker" && LOOPBACK_HOSTS.includes(connection.host)
      ? "host.docker.internal"
      : connection.host.replace(/^\[|\]$/g, "");
  return {
    PGHOST: host,
    PGPORT: connection.port,
    PGUSER: connection.user,
    PGPASSWORD: connection.password,
    PGDATABASE: connection.database,
    PGSSLMODE: connection.sslmode,
    PGCONNECT_TIMEOUT: "15",
  };
}

export function buildPgCommand(
  tool: PgTool,
  toolArgs: string[],
  connection: PgConnection,
  mode: PgToolsMode,
): PgCommand {
  const connectionEnv = pgEnv(connection, mode);
  const env = { ...process.env, ...connectionEnv };
  const secrets = connection.password ? [connection.password] : [];

  if (mode === "local") return { command: tool, args: toolArgs, env, secrets };

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      // `-e NOMBRE` sin valor: docker lo toma del entorno del cliente, no de la linea de comandos.
      ...Object.keys(connectionEnv).flatMap((name) => ["-e", name]),
      DOCKER_PG_IMAGE,
      tool,
      ...toolArgs,
    ],
    env,
    secrets,
  };
}

export function redactSecrets(text: string, secrets: string[]): string {
  return secrets
    .filter(Boolean)
    .reduce((out, secret) => out.split(secret).join("***"), text);
}

const OUTPUT_TAIL_BYTES = 8 * 1024;

function tail(text: string): string {
  return text.length > OUTPUT_TAIL_BYTES
    ? text.slice(-OUTPUT_TAIL_BYTES)
    : text;
}

export interface RunOptions {
  /** Escribe stdout en este archivo (dumps grandes: no pasan por memoria). */
  stdoutFile?: string;
  /** Lee stdin de este archivo (restore con `psql`). */
  stdinFile?: string;
}

/** Ejecuta el comando. En error rechaza con la cola de stderr, sin secretos. */
export function runPg(
  command: PgCommand,
  options: RunOptions = {},
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = tail(stderr + chunk);
    });

    let fileDone: Promise<void> = Promise.resolve();
    if (options.stdoutFile) {
      const out = createWriteStream(options.stdoutFile);
      fileDone = new Promise<void>((done, fail) => {
        out.on("finish", done);
        out.on("error", fail);
      });
      child.stdout.pipe(out);
    } else {
      child.stdout.on("data", (chunk) => {
        stdout = tail(stdout + chunk);
      });
    }

    // Si psql aborta antes de leer todo (ON_ERROR_STOP) el pipe se rompe: el codigo de salida informa.
    child.stdin.on("error", () => undefined);
    if (options.stdinFile) {
      const input = createReadStream(options.stdinFile);
      input.on("error", reject);
      input.pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    child.on("error", (error) => {
      reject(
        new Error(
          `No se pudo ejecutar ${command.command}: ${redactSecrets(error.message, command.secrets)}`,
        ),
      );
    });
    child.on("close", (code) => {
      fileDone.then(() => {
        if (code === 0) return resolve({ stdout });
        const imageIndex = command.args.indexOf(DOCKER_PG_IMAGE);
        const label =
          imageIndex >= 0 ? command.args[imageIndex + 1] : command.command;
        reject(
          new Error(
            `${label} fallo (codigo ${code}): ${redactSecrets(stderr, command.secrets).trim()}`,
          ),
        );
      }, reject);
    });
  });
}
