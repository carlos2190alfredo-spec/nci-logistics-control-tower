/**
 * Destino al que volver después de iniciar sesión (`/login?next=...`). Archivo SIN "use server".
 *
 * Solo se acepta la ruta exacta de una invitación (`/invitacion/<token>`): una lista de destinos permitidos tan
 * estrecha no deja espacio a una redirección abierta (`//otro.sitio`, `https://…`, `/\otro.sitio`, rutas con `..`).
 * Cualquier otra cosa se ignora y el inicio de sesión sigue su camino normal.
 */
const INVITATION_NEXT = /^\/invitacion\/[A-Za-z0-9_-]{20,100}$/;

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return INVITATION_NEXT.test(value) ? value : null;
}

/** `/login?next=/invitacion/<token>`: el enlace de "Iniciar sesión" de la página de invitación. */
export function loginPathForInvitation(token: string): string {
  const next = `/invitacion/${token}`;
  return safeNextPath(next) ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
