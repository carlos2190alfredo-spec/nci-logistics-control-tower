# HANDOFF LATEST

Fecha: 2026-07-11
Agente: Claude Opus 4.6 (MFA TOTP, enforcement por rol, dashboard de seguridad)

## Objetivo de la sesion

Implementar autenticacion multifactor (MFA/2FA) con TOTP segun RFC 6238: setup flow con QR, codigos de recuperacion, sesiones parciales, enforcement para roles privilegiados, reautenticacion de acciones sensibles, dashboard de seguridad, y documentacion completa.

## Fases completadas

| Fase | Commit | Descripcion |
| --- | --- | --- |
| Audit | 893c28f | Auditoria MFA con 8 hallazgos documentados (MFA_SECURITY_AUDIT.md) |
| Phase 1 | cb1ffa0 | Modelo de datos Prisma + core criptografico TOTP (AES-256-GCM, SHA-256) |
| Phase 2 | 244286c | Sesiones parciales + flujo de verificacion MFA en login |
| Phase 3 | 24a2b0d | Setup flow con QR, dashboard de seguridad, enforcement por rol |
| Phase 4 | (actual) | Tests, ADR-018, ADR-019, actualizacion documentacion |

## Arquitectura implementada

### MFA TOTP (ADR-018)
- `src/lib/server/mfa.ts`: core criptografico con AES-256-GCM para secretos, SHA-256 para codigos de recuperacion
- TOTP: SHA1, 6 digitos, periodo 30s, ventana ±1 (compatible con Google Authenticator, Authy, 1Password)
- 10 codigos de recuperacion hex (5-5-5-5), uso unico, hasheados
- Challenges MFA: TTL 5 min, max 5 intentos, proposito etiquetado

### Sesiones parciales
- Login con MFA activo → `PARTIAL_MFA_PENDING` con TTL 15 min
- `requireAuthenticatedUser()` redirige a `/mfa/verify`
- Verificacion exitosa → `MFA_VERIFIED` con TTL 7 dias
- `getPartialSession()` para la pagina de verificacion sin check de auth level

### Enforcement (ADR-019)
- Roles obligatorios: PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT, TENANT_OWNER, TENANT_ADMIN
- Guards: `requirePlatformRole()`, `requireTenantRole()`, `loginAction()`
- Sin MFA → redirige a `/account/security/mfa/setup`
- Reautenticacion: `requireRecentMfaOrPasswordAction` con ventana 15 min

### UI
- `/mfa/verify`: verificacion post-login (TOTP o recovery code)
- `/account/security`: dashboard con estado MFA, codigos restantes, warnings
- `/account/security/mfa/setup`: setup flow (QR + manual) o panel de gestion
- Shells: link actualizado a `/account/security`

## Archivos nuevos/modificados clave

| Archivo | Descripcion |
| --- | --- |
| `prisma/migrations/20260711073243_mfa_totp_and_recovery/` | Migracion: auth_level, user_mfa_secrets, mfa_recovery_codes, mfa_challenges |
| `src/lib/server/mfa.ts` | Core TOTP + crypto + recovery codes + challenges |
| `src/lib/server/mfa-actions.ts` | Server actions: verify, setup, activate, deactivate, regenerate, status, reauth |
| `src/lib/server/auth.ts` | Sesiones parciales, promotion, enforcement por rol |
| `src/lib/server/actions.ts` | loginAction con bifurcacion MFA |
| `src/app/mfa/verify/page.tsx` | Pagina verificacion MFA post-login |
| `src/components/mfa-verify-form.tsx` | Form TOTP/recovery toggle |
| `src/app/account/security/page.tsx` | Dashboard de seguridad |
| `src/app/account/security/mfa/setup/page.tsx` | Setup/gestion MFA |
| `src/components/mfa-setup-flow.tsx` | Multi-step: QR → verify → recovery codes |
| `src/components/mfa-manage-panel.tsx` | Regenerar codigos, desactivar MFA |
| `src/components/ui/field.tsx` | Props: autoComplete, inputMode, maxLength |
| `src/lib/server/mfa.test.ts` | 30 tests unitarios MFA |
| `scripts/security-check.ts` | 7 verificaciones MFA nuevas (32 total) |
| `docs/decisions/ADR-018-mfa-totp.md` | Decision: TOTP, AES-256-GCM, recovery codes |
| `docs/decisions/ADR-019-mfa-enforcement-reauth.md` | Decision: enforcement por rol, reautenticacion |

## Variables de entorno nuevas

| Variable | Descripcion | Ejemplo |
| --- | --- | --- |
| `MFA_ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar secretos TOTP (64 chars hex = 32 bytes) | `openssl rand -hex 32` |

## Conteos de verificacion

| Tipo | Antes | Despues |
| --- | --- | --- |
| Unit tests (Vitest) | 53 | 83 |
| E2E tests (Playwright) | 46 | 46 |
| Security checks | 25 | 32 |

## Backlog / riesgos residuales

- **MFA-VULN-008**: WebAuthn/FIDO2 como segundo factor alternativo (fase futura).
- Perdida de autenticador + codigos agotados requiere soporte manual.
- E2E tests para MFA no incluidos (requieren infraestructura TOTP en Playwright; candidato para fase futura con mocking de reloj).

## Dependencias nuevas

| Paquete | Version | Uso |
| --- | --- | --- |
| `otpauth` | 9.5.1 | Generacion y verificacion TOTP |
| `qrcode` | 1.5.4 | Generacion QR SVG server-side |
