# SESSION MANAGEMENT

Fecha: 2026-07-10

## Modelo

- Tabla `sessions` con:
  - `user_id`, `token_hash` (SHA-256, único),
  - `expires_at`, `revoked_at`, `created_at`,
  - `user_agent` (≤200 chars), `ip_hash` (HMAC-SHA256 con `SESSION_METADATA_KEY`), `last_seen_at`.
- `SessionSummary` (`src/lib/server/session-management.ts`) es la única forma de exponer datos de sesión al cliente. **No** incluye `tokenHash`, `ipHash`, ni el User-Agent completo — solo un resumen legible como "Chrome en macOS".

## Reglas

- Solo el propietario ve sus sesiones. Los guards `requireAuthenticatedUser` + filtro `where: { userId }` cubren cada endpoint.
- Los usuarios de plataforma **no** pueden revocar sesiones arbitrariamente sin modo soporte + motivo (no implementado en esta fase; documentado como P2).
- Cada revocación queda en `audit_logs`.
- La sesión actual se identifica por `session.id` obtenido en `getCurrentSession()`; nunca por el token.
- Confirmación implícita: cerrar "todas" o "todas las demás" son botones `variant="danger"`/`secondary` con label explícito.

## Server actions

- `revokeSessionAction(formData)` — cierra una sesión específica. Si es la actual, redirige a `/login`.
- `revokeOtherSessionsAction()` — cierra todas menos la actual.
- `revokeAllSessionsAction()` — cierra todas; redirige a `/login`.

## Datos expuestos

Solo lo mínimo para reconocer sesiones legítimas:

- Familia del navegador y sistema operativo derivados del User-Agent.
- Fechas de creación, última actividad, expiración.
- Marca "sesión actual" si aplica.

## Sesión actual y `lastSeenAt`

`getSession()` actualiza `last_seen_at` con throttle de 60 s. Evita escrituras en cada request y permite mostrar actividad reciente en la UI.

## Anti-patrones

- Nunca mostrar el token en claro o su hash.
- Nunca mostrar el User-Agent completo (podría filtrar la versión exacta del navegador → fingerprinting).
- Nunca listar sesiones de otros usuarios.
- Nunca permitir cerrar sesión por token desde una URL; solo por `session.id` desde una server action del propietario.

## Enlace desde la UI

En esta fase la página `/account/sessions` es accesible directamente por URL. Los shells de tenant/plataforma incorporarán un enlace en una fase próxima (fuera de alcance de esta fase para no ampliar el diseño).
