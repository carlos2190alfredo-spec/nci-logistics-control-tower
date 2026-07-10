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

class PostgresRateLimitProvider implements RateLimitProvider {
  async consume({ scope, key, limit, windowSeconds }: { scope: string; key: string; limit: number; windowSeconds: number }): Promise<RateLimitOutcome> {
    const db = getDb();
    const now = new Date();

    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.rateLimitBucket.findUnique({ where: { scope_key: { scope, key } } });

        const expired = !existing || existing.windowEnd <= now;
        if (expired) {
          const windowEnd = new Date(now.getTime() + windowSeconds * 1000);
          await tx.rateLimitBucket.upsert({
            where: { scope_key: { scope, key } },
            create: { scope, key, count: 1, windowEnd },
            update: { count: 1, windowEnd },
          });
          return {
            allowed: true,
            remaining: Math.max(0, limit - 1),
            retryAfterSeconds: 0,
            windowEndsAt: windowEnd,
          };
        }

        if (existing.count >= limit) {
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((existing.windowEnd.getTime() - now.getTime()) / 1000)),
            windowEndsAt: existing.windowEnd,
          };
        }

        const updated = await tx.rateLimitBucket.update({
          where: { scope_key: { scope, key } },
          data: { count: { increment: 1 } },
        });

        return {
          allowed: true,
          remaining: Math.max(0, limit - updated.count),
          retryAfterSeconds: 0,
          windowEndsAt: updated.windowEnd,
        };
      });
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

/** Elimina buckets vencidos: llamado ocasionalmente desde acciones sensibles. */
export async function pruneExpiredRateLimits() {
  await getDb().rateLimitBucket.deleteMany({ where: { windowEnd: { lt: new Date() } } });
}
