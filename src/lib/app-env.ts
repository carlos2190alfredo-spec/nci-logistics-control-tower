/**
 * Perfil de despliegue (ADR-036).
 *
 * - `local`: Docker local (Postgres, MinIO, Mailpit, ClamAV). Muestra credenciales demo.
 * - `staging`: nube para pruebas reales (Vercel + Supabase + ClamAV en Fly.io).
 * - `production`: clientes reales. Nunca muestra credenciales demo.
 *
 * Fuera de `local` nunca se exponen credenciales demo ni se aceptan secretos por defecto:
 * el repositorio es público y esos valores están en el código.
 *
 * El perfil falla cerrado (la variable por defecto no puede ser el valor permisivo):
 * - `APP_ENV` definido: debe ser exactamente `local`, `staging` o `production`. Cualquier
 *   otro valor ("prod", "Production", " staging") lanza un error, para que un typo no
 *   reactive las credenciales demo en silencio.
 * - `APP_ENV` sin definir: `NODE_ENV=production` (siempre el caso en Vercel y en
 *   `next build`/`next start`) resuelve a `production`; solo el desarrollo y las pruebas
 *   (`NODE_ENV` distinto de `production`) resuelven a `local`.
 */
export type AppEnv = "local" | "staging" | "production";

const APP_ENVS: readonly AppEnv[] = ["local", "staging", "production"];

export function getAppEnv(): AppEnv {
  const value = process.env.APP_ENV;

  if (value === undefined || value === "") {
    return process.env.NODE_ENV === "production" ? "production" : "local";
  }

  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;

  throw new Error(
    `APP_ENV=${JSON.stringify(value.slice(0, 40))} no es valido. Use exactamente: ${APP_ENVS.join(" | ")}.`,
  );
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
