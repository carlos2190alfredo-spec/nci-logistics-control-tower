import { isLocalEnv } from "@/lib/app-env";

/**
 * URL publica base de la aplicacion para construir enlaces en correos
 * (restablecer contrasena, verificar correo, invitaciones).
 *
 * Orden de resolucion:
 * 1. `NEXT_PUBLIC_APP_URL`
 * 2. `APP_URL`
 * 3. `https://${VERCEL_PROJECT_PRODUCTION_URL}` (Vercel lo inyecta sin protocolo)
 *
 * `http://localhost:3000` solo se usa como valor de desarrollo cuando el perfil
 * es `local`. Fuera de `local` sin configuracion, o con una URL que no sea
 * https o que apunte a localhost, lanza un error claro: un correo con un enlace
 * a localhost es un fallo silencioso (el usuario nunca puede completar el flujo).
 */

const LOCAL_FALLBACK = "http://localhost:3000";

type Env = Record<string, string | undefined>;

export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlError";
  }
}

function configuredUrl(env: Env): { raw: string; source: string } | null {
  const fromPublic = env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromPublic) return { raw: fromPublic, source: "NEXT_PUBLIC_APP_URL" };

  const fromServer = env.APP_URL?.trim();
  if (fromServer) return { raw: fromServer, source: "APP_URL" };

  const fromVercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromVercel) {
    const raw = /^https?:\/\//i.test(fromVercel)
      ? fromVercel
      : `https://${fromVercel}`;
    return { raw, source: "VERCEL_PROJECT_PRODUCTION_URL" };
  }

  return null;
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/** Version pura (sin leer `process.env`) para poder probar todas las ramas. */
export function resolveAppBaseUrl(env: Env, local: boolean): string {
  const configured = configuredUrl(env);

  if (!configured) {
    if (local) return LOCAL_FALLBACK;
    throw new AppUrlError(
      "Falta la URL publica de la aplicacion: defina NEXT_PUBLIC_APP_URL (o APP_URL) con la URL https del despliegue.",
    );
  }

  let url: URL;
  try {
    url = new URL(configured.raw);
  } catch {
    throw new AppUrlError(`${configured.source} no es una URL valida.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppUrlError(`${configured.source} debe usar http o https.`);
  }

  if (!local) {
    if (url.protocol !== "https:") {
      throw new AppUrlError(
        `${configured.source} debe usar https fuera del perfil local.`,
      );
    }
    if (isLoopbackHost(url.hostname)) {
      throw new AppUrlError(
        `${configured.source} apunta a localhost y no sirve para enlaces en correos.`,
      );
    }
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function getAppBaseUrl(): string {
  return resolveAppBaseUrl(process.env, isLocalEnv());
}

/** Enlace absoluto a una ruta de la aplicacion. */
export function appUrl(path: string): string {
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
