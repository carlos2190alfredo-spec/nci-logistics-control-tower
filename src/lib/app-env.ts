/**
 * Perfil de despliegue (ADR-036).
 *
 * - `local`: Docker local (Postgres, MinIO, Mailpit, ClamAV). Muestra credenciales demo.
 * - `staging`: nube para pruebas reales (Vercel + Supabase + ClamAV en Fly.io).
 * - `production`: reservado; requiere aprobación aparte.
 *
 * Fuera de `local` nunca se exponen credenciales demo ni se aceptan secretos por defecto:
 * el repositorio es público y esos valores están en el código.
 */
export type AppEnv = "local" | "staging" | "production";

export function getAppEnv(): AppEnv {
  const value = process.env.APP_ENV;
  return value === "staging" || value === "production" ? value : "local";
}

export function isLocalEnv() {
  return getAppEnv() === "local";
}

/** Lee una variable obligatoria fuera de `local`; en `local` usa el valor de desarrollo. */
export function envOrLocalDefault(name: string, localDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isLocalEnv()) return localDefault;
  throw new Error(
    `Falta la variable de entorno ${name} (APP_ENV=${getAppEnv()}).`,
  );
}
