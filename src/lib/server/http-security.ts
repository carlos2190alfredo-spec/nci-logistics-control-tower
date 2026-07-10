import { logger } from "@/lib/server/logger";

/**
 * Whitelist de orígenes autorizados. En local se acepta el propio host
 * (Playwright y `pnpm dev`). En producción se debe fijar `ALLOWED_ORIGINS`.
 */
function parseAllowlist() {
  const raw = process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowlist();

export type OriginCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Valida Origin y Host para mutaciones fuera de server actions.
 * - Origin ausente en same-origin desde algunos clientes es aceptable si Sec-Fetch-Site=same-origin.
 * - En dev y test se admite `null` origin cuando el Host coincide.
 */
export function verifyMutationOrigin(request: Request): OriginCheckResult {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (!host) return { ok: false, reason: "missing-host" };

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      logger.warn("origin rejected", { origin, host });
      return { ok: false, reason: "origin-not-allowed" };
    }
    // El Origin autorizado también debe coincidir con el host servido.
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return { ok: false, reason: "origin-invalid" };
    }
    if (originHost !== host) {
      logger.warn("origin/host mismatch", { origin, host });
      return { ok: false, reason: "origin-host-mismatch" };
    }
    return { ok: true };
  }

  // Sin Origin (algunos user agents no lo envían en same-origin) exigimos Sec-Fetch-Site same-origin.
  if (secFetchSite === "same-origin") return { ok: true };

  logger.warn("origin missing and not same-origin", { host, secFetchSite });
  return { ok: false, reason: "origin-missing" };
}

/** Valida el content-type esperado; evita CSRF vía form vs JSON confusion. */
export function requireJsonContentType(request: Request): OriginCheckResult {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, reason: "content-type-invalid" };
  }
  return { ok: true };
}

export function clientIpFrom(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}
