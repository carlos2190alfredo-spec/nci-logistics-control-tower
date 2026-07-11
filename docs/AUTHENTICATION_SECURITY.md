# AUTHENTICATION SECURITY

Fecha: 2026-07-10
Base: [SECURITY_HARDENING.md](SECURITY_HARDENING.md), [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md).

## Controles activos

### Contraseñas

- Argon2id con `memoryCost=19456`, `timeCost=2`, `parallelism=1` (`src/lib/server/crypto.ts`).
- Longitud mínima 10 y máxima 128 caracteres para reset (compatible con gestores).
- Sin trimming silencioso; no bloquea pegar.

### Login

- Rate limit persistente por correo: 30/min en local, ajustable a 10/min en producción.
- Delay constante 250 ms en fallo o rate-limit — mitiga enumeración por timing.
- Mensaje genérico "Credenciales invalidas" — no revela si el usuario existe.

### Sesiones

- Token opaco de 32 bytes (base64url).
- Persistido como SHA-256 (`hashToken`); el token en claro solo vive en la cookie.
- Cookie `httpOnly`, `sameSite=Lax`, `secure` en producción, `path=/`, expiración 7 días.
- Al iniciar sesión se **revoca** la sesión asociada a la cookie previa del navegador (mitigación de session fixation). Verificado en `SEC-AUTH-001`.
- Cada sesión guarda `userAgent` truncado a 200 chars y `ipHash` (HMAC-SHA256 con `SESSION_METADATA_KEY`).
- `lastSeenAt` se actualiza con throttle de 60 s en cada `getSession()`.

### Logout

- Revoca la sesión activa (marca `revokedAt`).
- Borra la cookie.

### Recuperación de contraseña

- Ruta `/recuperar` para solicitar; `/recuperar/[token]` para restablecer.
- Ambas con `robots: noindex, nofollow` y `dynamic = "force-dynamic"`.
- Token opaco 32 bytes (base64url) → SHA-256 en DB (`password_reset_tokens.token_hash`).
- TTL 20 minutos, un solo uso (`used_at`), revocación explícita (`revoked_at`), `requested_ip_hash` HMAC.
- Solicitar un nuevo token invalida los tokens previos vigentes del mismo usuario.
- Respuesta neutral: la misma UI exista o no el correo; delay constante 300 ms.
- Rate limit doble: 5/15min por correo, 20/15min por IP; 10/15min para consumir tokens por IP.
- Correo profesional en español desde Mailpit, sin branding de tenant.
- Al restablecer: `revokeAllUserSessions(userId, "password-reset")` invalida todas las sesiones.
- Contraseña en el body de la server action; nunca en logs.
- URL del token no queda en referrer: Referrer-Policy global `strict-origin-when-cross-origin`.

### Gestión de sesiones activas

- Página `/account/sessions` con sesión actual marcada.
- Muestra User-Agent resumido (familia + SO), fecha creación, última actividad, expiración.
- No expone `tokenHash`, `ipHash`, ni User-Agent completo.
- Acciones:
  - Cerrar una sesión específica (si es la actual, redirige a login).
  - Cerrar todas las demás (mantiene la actual).
  - Cerrar todas (redirige a login).
- Cada revocación queda auditada (`auth.sessions.revoke_one`, `auth.sessions.revoke_others`, `auth.sessions.revoke_all`).

### Autenticacion multifactor (MFA/2FA)

- TOTP (RFC 6238) con `otpauth` v9.5.1. SHA1, 6 digitos, periodo 30s, ventana ±1.
- Secreto TOTP cifrado en reposo con AES-256-GCM. Clave en `MFA_ENCRYPTION_KEY` (env var).
- 10 codigos de recuperacion hex (5-5-5-5), hasheados con SHA-256, uso unico.
- **Sesiones parciales**: login con MFA activo crea sesion `PARTIAL_MFA_PENDING` (TTL 15 min). `requireAuthenticatedUser()` redirige a `/mfa/verify`. Tras verificacion: `MFA_VERIFIED` (TTL 7 dias).
- Rate limit: 10 intentos de verificacion MFA por usuario cada 15 minutos.
- **Enforcement**: roles privilegiados (PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT, TENANT_OWNER, TENANT_ADMIN) requieren MFA activo. Guards en `requirePlatformRole()`, `requireTenantRole()`, `loginAction()`.
- **Desactivacion segura**: requiere password + TOTP. Elimina secreto, codigos y challenges en transaccion.
- **Regeneracion de codigos**: requiere password + TOTP. Invalida codigos anteriores.
- **Reautenticacion**: `requireRecentMfaOrPasswordAction` con ventana 15 min via `MfaChallenge`.
- **Dashboard**: `/account/security` con estado MFA, codigos restantes, warning para roles privilegiados.
- **Pagina de verificacion** `/mfa/verify`: `noindex`, `force-dynamic`.
- **Auditoria**: `mfa.activated`, `mfa.deactivated`, `mfa.login_verified`, `mfa.login_code_failed`, `mfa.recovery_code_used`, `mfa.recovery_code_failed`, `mfa.recovery_codes_regenerated`.
- Decisiones: ADR-018, ADR-019.

## Anti-patrones evitados

- No hay bloqueo permanente de cuentas — solo rate limit y delay.
- No se responde diferente si el usuario existe o no en recuperación.
- No se registra el token de recuperación en logs; el logger truncados y `redact()` cubre otros campos.
- No se muestra el token en la URL una vez usado (el server redirige a `/login?password-reset=ok`).

## Pruebas

- Unit — `src/lib/server/password-reset-pure.test.ts` (5 asserts sobre contratos: solo hash en DB, TTL corto, tx, revocación de sesiones, respuesta silenciosa a correo inexistente).
- Unit — `src/lib/server/session-management.test.ts` (SessionSummary no expone hashes).
- Unit — `src/lib/server/mfa.test.ts` (30 tests: TOTP generation/verification, recovery codes, security invariants).
- E2E — `tests/e2e/security-auth.spec.ts`:
  - `SEC-AUTH-001` login revoca sesión previa del mismo navegador.
  - `SEC-AUTH-002` respuesta neutral para correo inexistente.
  - `SEC-AUTH-003` reset con token válido invalida todas las sesiones.
  - `SEC-AUTH-004` gestión de sesiones cierra las demás.

## Riesgos residuales

- Robo de cookie por XSS o malware local. Mitigación: `httpOnly`, CSP restrictiva, sin `dangerouslySetInnerHTML`.
- Dispositivo compartido físicamente. Mitigación: `LogoutGuard` + gestión de sesiones.
- Perdida de autenticador + codigos de recuperacion agotados requiere soporte manual.
- WebAuthn/FIDO2 como alternativa adicional de segundo factor (backlog MFA-VULN-008).
- Rate limit por IP puede eludirse tras proxy no confiable. Ver [DEPENDENCY_REACHABILITY.md](DEPENDENCY_REACHABILITY.md).
