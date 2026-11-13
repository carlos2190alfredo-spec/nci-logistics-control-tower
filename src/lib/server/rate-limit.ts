import { getDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";

/**
 * Rate limiting persistido en PostgreSQL (tabla `rate_limit_buckets`).
 * Compatible con varias instancias porque el conteo vive en DB, no en memoria.
 * Contrato: `RateLimitProvider` para poder cambiar el backend (Redis en el
 * futuro) sin tocar callsites.
 */

export type RateLimitOutcome = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  windowEndsAt: Date;
};

export interface RateLimitProvider {
  consume(input: { scope: string; key: string; limit: number; windowSeconds: number }): Promise<RateLimitOutcome>;
}

/** Fila que devuelve la sentencia atomica de `consume` (nombres de columna SQL). */
export type RateLimitBucketRow = {
  count: number;
  window_end: Date;
  /** Segundos que faltan para que venza la ventana, segun el reloj de la base de datos. */
  seconds_left: number;
};

/** Ventana en segundos como entero >= 1 (la sentencia SQL la usa como intervalo). */
export function normalizeWindowSeconds(windowSeconds: number): number {
  return Number.isFinite(windowSeconds) ? Math.max(1, Math.ceil(windowSeconds)) : 1;
}

/**
 * Traduce la fila del bucket (ya incrementada) al resultado publico.
 * La peticion que ocupa la posicion `limit` aun pasa; la `limit + 1` es la primera bloqueada.
 */
export function outcomeFromBucketRow(row: RateLimitBucketRow, limit: number): RateLimitOutcome {
  const allowed = row.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(row.seconds_left)),
    windowEndsAt: row.window_end,
  };
}

class PostgresRateLimitProvider implements RateLimitProvider {
  async consume({ scope, key, limit, windowSeconds }: { scope: string; key: string; limit: number; windowSeconds: number }): Promise<RateLimitOutcome> {
    const db = getDb();
    const now = new Date();
    const windowSecs = normalizeWindowSeconds(windowSeconds);

    try {
      // Una sola sentencia atomica: INSERT ... ON CONFLICT DO UPDATE bloquea la fila, asi que
      // dos instancias serverless concurrentes nunca leen el mismo contador. El reinicio de la
      // ventana tambien ocurre dentro del mismo UPDATE. Usa el reloj de Postgres (UTC, igual que
      // las columnas `timestamp` que escribe Prisma) para no depender del reloj de cada instancia.
      const rows = await db.$queryRaw<RateLimitBucketRow[]>`
        INSERT INTO "rate_limit_buckets" ("id", "scope", "key", "count", "window_end", "updated_at")
        VALUES (
          gen_random_uuid(),
          ${scope},
          ${key},
          1,
          (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSecs}::int),
          now() AT TIME ZONE 'UTC'
        )
        ON CONFLICT ("scope", "key") DO UPDATE SET
          "count" = CASE
            WHEN "rate_limit_buckets"."window_end" <= (now() AT TIME ZONE 'UTC') THEN 1
            ELSE "rate_limit_buckets"."count" + 1
          END,
          "window_end" = CASE
            WHEN "rate_limit_buckets"."window_end" <= (now() AT TIME ZONE 'UTC')
              THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSecs}::int)
            ELSE "rate_limit_buckets"."window_end"
          END,
          "updated_at" = now() AT TIME ZONE 'UTC'
        RETURNING
          "count",
          "window_end",
          EXTRACT(EPOCH FROM ("window_end" - (now() AT TIME ZONE 'UTC')))::float8 AS "seconds_left"
      `;

      const row = rows[0];
      if (!row) throw new Error("rate-limit statement returned no row");
      return outcomeFromBucketRow(row, limit);
    } catch (error) {
      logger.error("rate-limit provider failure", { scope, error: error instanceof Error ? error.message : "unknown" });
      // Fail-closed en scopes de autenticación; fail-open en operativos.
      const failClosed = scope.startsWith("auth.");
      return {
        allowed: !failClosed,
        remaining: 0,
        retryAfterSeconds: failClosed ? windowSeconds : 0,
        windowEndsAt: new Date(now.getTime() + windowSeconds * 1000),
      };
    }
  }
}

let provider: RateLimitProvider = new PostgresRateLimitProvider();

export function setRateLimitProvider(next: RateLimitProvider) {
  provider = next;
}

export function getRateLimitProvider(): RateLimitProvider {
  return provider;
}

export async function enforceRateLimit(input: { scope: string; key: string; limit: number; windowSeconds: number }) {
  return provider.consume(input);
}

/** Elimina buckets vencidos. Lo llama el cron diario de mantenimiento. Devuelve cuantos borro. */
export async function pruneExpiredRateLimits(): Promise<number> {
  const { count } = await getDb().rateLimitBucket.deleteMany({ where: { windowEnd: { lt: new Date() } } });
  return count;
}
