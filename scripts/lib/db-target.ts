import { getAppEnv, type AppEnv } from "../../src/lib/app-env";

/**
 * Guardas de destino de base de datos para los scripts que escriben (OPS-03, F4).
 *
 * Todos los scripts que siembran, reinician, migran o purgan leen `DATABASE_URL` y deben
 * mostrar a qué servidor apuntan (host, puerto y base; nunca usuario ni contraseña) y
 * negarse a tocar un host remoto por accidente. La lógica de decisión es pura y está probada
 * (`db-target.test.ts`); las funciones `guard*` / `require*` solo hacen la E/S.
 */

/** Hosts locales: Docker Compose (servicio `postgres`, contenedor `nci-lct-postgres`) y la propia máquina. */
export const LOCAL_DB_HOSTS: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "postgres",
  "nci-lct-postgres",
  "host.docker.internal",
];

export interface DbTarget {
  /** Hostname en minúsculas, o la ruta del socket Unix. */
  host: string;
  port: string;
  database: string;
  /** Conexión por socket Unix (`?host=/ruta`). */
  socket: boolean;
  /** `?pgbouncer=true`: pooler en modo transacción (no sirve para migrar ni para pg_dump). */
  pgbouncer: boolean;
}

/** Extrae el destino de una URL de Postgres. Devuelve `null` si no se puede interpretar. */
export function parseDbTarget(
  databaseUrl: string | undefined,
): DbTarget | null {
  if (!databaseUrl) return null;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    return null;

  const socketPath = url.searchParams.get("host") ?? "";
  const socket = !url.hostname && socketPath.startsWith("/");
  const host = (socket ? socketPath : url.hostname).toLowerCase();
  if (!host) return null;

  let database = url.pathname.replace(/^\//, "");
  try {
    database = decodeURIComponent(database);
  } catch {
    // Se deja el nombre tal cual si no es una secuencia % valida.
  }

  return {
    host,
    port: url.port || "5432",
    database,
    socket,
    pgbouncer: url.searchParams.get("pgbouncer") === "true",
  };
}

export function isLocalDbHost(target: DbTarget): boolean {
  return target.socket || LOCAL_DB_HOSTS.includes(target.host);
}

/** `host:puerto/base`, sin credenciales. Es lo único de la URL que se imprime. */
export function formatDbTarget(target: DbTarget | null): string {
  if (!target) return "desconocido";
  if (target.socket) return `socket ${target.host}/${target.database}`;
  return `${target.host}:${target.port}/${target.database}`;
}

/**
 * - `seed`: `db:seed` y similares. Bloquea el perfil local contra un host remoto.
 * - `demo`: `demo:seed` / `demo:reset` / `demo:status`. Igual que `seed` y además nunca en producción.
 * - `reset`: `db:reset` (borra la base). Bloquea cualquier host remoto, en cualquier perfil, y la producción.
 */
export type DbGuardMode = "seed" | "demo" | "reset";

export interface DbGuardInput {
  databaseUrl: string | undefined;
  appEnv: AppEnv;
  allowRemote: boolean;
  mode: DbGuardMode;
}

export interface DbGuardResult {
  ok: boolean;
  target: DbTarget | null;
  remote: boolean;
  reason?: string;
  warning?: string;
}

export function evaluateDbGuard({
  databaseUrl,
  appEnv,
  allowRemote,
  mode,
}: DbGuardInput): DbGuardResult {
  const target = parseDbTarget(databaseUrl);
  if (!target) {
    return {
      ok: false,
      target: null,
      remote: true,
      reason:
        "DATABASE_URL no esta definida o no es una URL de Postgres valida.",
    };
  }

  const remote = !isLocalDbHost(target);
  const where = formatDbTarget(target);

  if (appEnv === "production" && mode !== "seed") {
    return {
      ok: false,
      target,
      remote,
      reason: `Este comando no se ejecuta con APP_ENV=production (destino ${where}).`,
    };
  }

  // `reset` borra la base completa: el bloqueo contra un host remoto es ABSOLUTO y no se
  // puede levantar con ALLOW_REMOTE_SEED (esa bandera solo habilita sembrar).
  if (remote && mode === "reset") {
    return {
      ok: false,
      target,
      remote,
      reason:
        `DATABASE_URL apunta a un host remoto (${where}) con APP_ENV=${appEnv}. ` +
        "db:reset borra la base completa y solo corre contra la base local.",
    };
  }

  if (remote && !allowRemote && appEnv === "local") {
    return {
      ok: false,
      target,
      remote,
      reason:
        `DATABASE_URL apunta a un host remoto (${where}) con APP_ENV=${appEnv}. ` +
        'El perfil "local" publica las credenciales demo del repositorio. ' +
        "Para un staging use APP_ENV=staging con SEED_PASSWORD y SEED_TOTP_SECRET. " +
        "Si de verdad es intencional, exporte ALLOW_REMOTE_SEED=true.",
    };
  }

  if (remote && allowRemote && appEnv === "local") {
    return {
      ok: true,
      target,
      remote,
      warning: `ALLOW_REMOTE_SEED=true: perfil local contra un host remoto (${where}). Se escribiran las credenciales demo publicas del repositorio.`,
    };
  }

  return { ok: true, target, remote };
}

export interface HostConfirmationResult {
  ok: boolean;
  reason?: string;
}

/** Un host no local exige `CONFIRM_DB_HOST` igual al host (mismo patron que `db:deploy`). */
export function evaluateHostConfirmation(
  target: DbTarget | null,
  confirm: string | undefined,
): HostConfirmationResult {
  if (!target) {
    return {
      ok: false,
      reason:
        "DATABASE_URL no esta definida o no es una URL de Postgres valida.",
    };
  }
  if (isLocalDbHost(target)) return { ok: true };
  if ((confirm ?? "").trim().toLowerCase() === target.host) return { ok: true };
  return {
    ok: false,
    reason:
      `El destino ${formatDbTarget(target)} no es local. ` +
      `Para continuar repita el host exacto: CONFIRM_DB_HOST=${target.host}`,
  };
}

function fail(label: string, message: string): never {
  console.error(`\n[${label}] BLOQUEADO: ${message}\n`);
  process.exit(1);
}

function resolveAppEnv(label: string): AppEnv {
  try {
    return getAppEnv();
  } catch (error) {
    return fail(label, (error as Error).message);
  }
}

/** Imprime el destino (sin credenciales). */
export function printDbTarget(
  label: string,
  target: DbTarget | null,
  appEnv?: AppEnv,
) {
  const env = appEnv ? ` (APP_ENV=${appEnv})` : "";
  console.log(`[${label}] Destino: ${formatDbTarget(target)}${env}`);
}

/**
 * Imprime el destino y aborta el proceso si el modo no puede correr contra él.
 * Debe llamarse despues de cargar dotenv y antes de cualquier escritura.
 */
export function guardDbTarget(mode: DbGuardMode, label: string): DbTarget {
  const appEnv = resolveAppEnv(label);
  const result = evaluateDbGuard({
    databaseUrl: process.env.DATABASE_URL,
    appEnv,
    allowRemote: process.env.ALLOW_REMOTE_SEED === "true",
    mode,
  });
  printDbTarget(label, result.target, appEnv);
  if (!result.ok || !result.target)
    fail(label, result.reason ?? "destino no permitido.");
  if (result.warning) console.warn(`[${label}] AVISO: ${result.warning}`);
  return result.target;
}

/**
 * Imprime el destino y exige `CONFIRM_DB_HOST` si el host no es local.
 * Lo usan `db:deploy`, `prod:bootstrap` y `demo:purge`.
 */
export function requireConfirmedHost(label: string): DbTarget {
  const target = parseDbTarget(process.env.DATABASE_URL);
  printDbTarget(label, target);
  const result = evaluateHostConfirmation(target, process.env.CONFIRM_DB_HOST);
  if (!result.ok || !target)
    fail(label, result.reason ?? "destino no confirmado.");
  return target;
}
