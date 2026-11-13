/**
 * Avisos de las acciones de usuarios del tenant (`?error=` / `?warning=` en /admin/users).
 * Los codigos son fijos (los emite tenant-user-actions.ts); la URL nunca refleja texto libre.
 */
export type TenantUserNotice = { tone: "warning" | "danger"; text: string };

const ERRORS: Record<string, string> = {
  role_not_grantable: "Su rol no puede asignar ese rol. Solo un propietario concede el rol de propietario.",
  owner_protected: "Solo un propietario puede modificar a otro propietario.",
  self_change: "No puede cambiar su propio rol ni desactivarse a si mismo.",
  last_owner: "El tenant debe conservar al menos un propietario activo.",
  actor_not_allowed: "Su rol no permite administrar usuarios.",
  rate_limited: "Se alcanzo el limite de correos de alta por hora. Intente de nuevo mas tarde.",
  already_member: "Ese correo ya es miembro de este tenant. Use la edicion para cambiar su rol.",
};

const WARNINGS: Record<string, string> = {
  welcome_email_failed:
    "La cuenta se creo, pero no se pudo enviar el correo de bienvenida. La persona puede usar «Olvide mi contrasena» cuando el correo este operativo.",
};

export function tenantUserNotice(params: { error?: string | string[]; warning?: string | string[] }): TenantUserNotice | null {
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const warning = Array.isArray(params.warning) ? params.warning[0] : params.warning;
  if (error && ERRORS[error]) return { tone: "danger", text: ERRORS[error] };
  if (warning && WARNINGS[warning]) return { tone: "warning", text: WARNINGS[warning] };
  return null;
}
