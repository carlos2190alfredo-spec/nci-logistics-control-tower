# ADR-009: Rotación y revocación de sesiones

Fecha: 2026-07-10
Estado: Aceptada

## Contexto

La auditoría independiente (`docs/CLAUDE_SECURITY_AUDIT.md`) confirmó que:
- `signIn` creaba una nueva sesión pero **no** invalidaba la sesión previa asociada al mismo navegador. Un token dejado en cookies persistidas podía sobrevivir un nuevo login.
- No existía forma de que el usuario viera ni cerrara sus sesiones activas.
- El cambio o reset de contraseña (aún no existente) debía invalidar todas las sesiones.

## Decisiones

1. **Rotación de sesión en login** (VULN-002):
   - En `signIn`, si la request trae cookie con `sessionCookieName`, se revoca la sesión asociada (`session.updateMany({ where: { tokenHash: hashToken(previousToken) }, data: { revokedAt: now } })`) ANTES de crear la nueva.
   - Se generan token nuevo, cookie nueva y `session` nueva con `userAgent` (truncado 200 chars) e `ipHash` (HMAC-SHA256 con `SESSION_METADATA_KEY`).
   - Auditoría `auth.login` referencia el `session.id` creado.
2. **`revokeAllUserSessions(userId, reason)`** — helper reutilizable desde reset de contraseña y "cerrar todas las sesiones" del usuario.
3. **`revokeSessionById(userId, sessionId)`** y **`revokeOtherSessions(userId, currentSessionId)`** — helpers granulares.
4. **`SessionSummary`** exposed to UI:
   - No incluye `tokenHash`, `ipHash`, ni User-Agent completo.
   - Familia del navegador + SO derivados; fechas legibles; marca "sesión actual".
5. **Página `/account/sessions`** con acciones "cerrar una", "cerrar todas las demás", "cerrar todas".
6. **`lastSeenAt`** con throttle de 60 s en `getSession()` para actividad reciente.

## Alternativas descartadas

- **Rotar el token en cada request**: costo de escritura elevado y complejidad para clientes offline. Aceptamos ventana de 7 días con revocación proactiva desde la UI.
- **JWT firmados en lugar de sesiones opacas**: incompatible con revocación instantánea sin blocklist; añade complejidad y superficie criptográfica. Aceptamos sesiones opacas.
- **2FA / MFA**: fuera del alcance de esta fase. Aceptado como P2.

## Consecuencias

- Nueva migración `20260710080000_session_metadata_and_reset_revocation` con columnas `user_agent`, `ip_hash`, `last_seen_at` en `sessions` y `revoked_at`, `requested_ip_hash` en `password_reset_tokens`.
- `signIn` ahora depende de `next/headers` para leer User-Agent e `X-Forwarded-For` — sin impacto en tests unit puros.
- Los E2E existentes siguen pasando: la sesión previa se revoca solo si venía en la cookie del navegador que hace login.
- Riesgo residual: robo de cookie por XSS o dispositivo comprometido. Mitigado con `httpOnly`, CSP y `LogoutGuard`.
