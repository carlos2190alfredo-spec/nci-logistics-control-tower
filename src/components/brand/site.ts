import type { Metadata } from "next";

/**
 * Identidad publica del sitio: nombre, descripcion, origen canonico y politica
 * de indexacion. La consumen layout.tsx, robots.ts, sitemap.ts y las paginas
 * publicas (landing y login). Lee el entorno directamente: `getAppEnv()` lanza o
 * degrada a `local` ante valores inesperados y aqui la regla es la contraria,
 * solo `APP_ENV=production` se indexa y todo lo demas (local, staging o un valor
 * desconocido) queda cerrado a buscadores.
 */

export const SITE_NAME = "NCI Logistics Control Tower";
export const SITE_SHORT_NAME = "NCI LCT";
export const SITE_DESCRIPTION =
  "Plataforma multiempresa para transportistas de carga: solicitudes, flota, conductor, evidencias y prueba de entrega digital.";

/** Color de marca (tinta) para la barra del navegador movil; coincide con el manifiesto. */
export const SITE_THEME_COLOR = "#0b2338";

const FALLBACK_ORIGIN = "http://localhost:3000";

/** Solo estas rutas publicas se indexan (y solo en produccion). */
export const INDEXABLE_PATHS = ["/", "/login"] as const;

/**
 * Prefijos que nunca deben rastrearse: areas autenticadas, APIs y flujos con
 * token (recuperar contrasena, verificar correo, MFA).
 */
export const PRIVATE_PATH_PREFIXES = [
  "/t/",
  "/platform",
  "/api/",
  "/account",
  "/mfa",
  "/verificar-email",
  "/recuperar",
  "/offline",
] as const;

type Env = Record<string, string | undefined>;

function toOrigin(candidate: string | undefined): string | null {
  const value = candidate?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Origen publico del despliegue (sin ruta ni barra final).
 * Prioridad (igual que src/lib/server/app-url.ts): NEXT_PUBLIC_APP_URL, APP_URL, luego el dominio de produccion que Vercel
 * inyecta (`VERCEL_PROJECT_PRODUCTION_URL`, sin protocolo) y por ultimo localhost.
 */
export function resolveSiteOrigin(env: Env = process.env): string {
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return (
    toOrigin(env.NEXT_PUBLIC_APP_URL) ??
    toOrigin(env.APP_URL) ??
    (vercelHost ? toOrigin(`https://${vercelHost}`) : null) ??
    FALLBACK_ORIGIN
  );
}

/** `true` solo con APP_ENV=production exacto; cualquier otro valor cierra la indexacion. */
export function allowsIndexing(env: Env = process.env): boolean {
  return env.APP_ENV?.trim() === "production";
}

/** Metadatos Open Graph base; las paginas los extienden (Next no fusiona `openGraph` anidado). */
export function siteOpenGraph(
  overrides: { title?: string; description?: string; url?: string } = {},
): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: SITE_NAME,
    locale: "es_LA",
    title: overrides.title ?? SITE_NAME,
    description: overrides.description ?? SITE_DESCRIPTION,
    ...(overrides.url ? { url: overrides.url } : {}),
  };
}

/**
 * Tarjeta de Twitter/X coherente con `siteOpenGraph`. Es `summary` (texto) porque
 * el sitio aun no tiene imagen social propia; al agregarla pasar a `summary_large_image`.
 */
export function siteTwitter(
  overrides: { title?: string; description?: string } = {},
): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary",
    title: overrides.title ?? SITE_NAME,
    description: overrides.description ?? SITE_DESCRIPTION,
  };
}
