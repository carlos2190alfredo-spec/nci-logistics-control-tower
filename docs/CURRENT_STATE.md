# CURRENT STATE

Fecha: 2026-07-11

## Fase actual

MFA/2FA con TOTP completado. Autenticacion multifactor implementada: setup flow con QR, sesiones parciales, enforcement por rol, dashboard de seguridad, codigos de recuperacion, reautenticacion para acciones sensibles.

## Implementado (fase actual — MFA TOTP)

- **Migracion** `20260711073243_mfa_totp_and_recovery` (aplicada): agrega `auth_level` a sessions, crea tablas `user_mfa_secrets`, `mfa_recovery_codes`, `mfa_challenges` con indices y foreign keys.
- **MFA-VULN-001 (P0) corregida**: TOTP (RFC 6238) con `otpauth` v9.5.1. Secretos cifrados con AES-256-GCM. Setup en dos pasos: generar secreto + verificar codigo. QR SVG server-side con `qrcode` v1.5.4.
- **MFA-VULN-002 (P0) corregida**: 10 codigos de recuperacion hex formateados, almacenados como SHA-256 hash, uso unico. Regeneracion requiere password + TOTP.
- **MFA-VULN-003 (P0) corregida**: sesiones parciales con `authLevel = PARTIAL_MFA_PENDING` y TTL de 15 min. `requireAuthenticatedUser()` redirige a `/mfa/verify`. Promocion a `MFA_VERIFIED` con TTL de 7 dias tras verificacion exitosa.
- **MFA-VULN-004 (P1) corregida**: enforcement para `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`, `TENANT_OWNER`, `TENANT_ADMIN`. Guards en `requirePlatformRole()`, `requireTenantRole()`, y `loginAction()`.
- **MFA-VULN-005 (P1) corregida**: desactivacion y regeneracion requieren password + TOTP. Desactivacion elimina secreto, codigos y challenges en transaccion.
- **MFA-VULN-006 (P1) corregida**: rate limit de 10 intentos por usuario cada 15 minutos en verificacion MFA.
- **MFA-VULN-007 (P2) corregida**: dashboard de seguridad en `/account/security` con estado MFA, conteo de codigos de recuperacion, advertencia para roles privilegiados sin MFA. Navegacion shells actualizada.
- **Auditoria completa**: eventos `mfa.activated`, `mfa.deactivated`, `mfa.login_verified`, `mfa.login_code_failed`, `mfa.recovery_code_used`, `mfa.recovery_code_failed`, `mfa.recovery_codes_regenerated`.
- **Tests**: 30 tests unitarios nuevos (83 total). 7 verificaciones de seguridad nuevas (32 total).
- **Documentacion**: ADR-018 (MFA TOTP), ADR-019 (enforcement/reauth), HANDOFF, VERIFICATION, SECURITY actualizados.

## Base preservada

- Next.js App Router con TypeScript estricto.
- Docker (PostgreSQL 5433, MinIO, Mailpit, ClamAV 3310) saludable.
- Autenticacion Argon2id + sesiones opacas SHA-256 + cookies httpOnly SameSite Lax.
- Flujo operativo completo cliente → operaciones → conductor → evidencia → POD → cierre.
- Cola offline del conductor con idempotencia server-side.
- Firma real embebida en el POD PDF.
- Pipeline de cuarentena de archivos con ClamAV.
- PWA instalable con fotos offline y sync engine.
- Aislamiento multitenant server-side (guards y filtros por `tenantId`).
- Recuperacion de contrasena con Mailpit.
- Gestion de sesiones activas.
- 46 E2E tests.

## Riesgos residuales documentados

- **MFA-VULN-008** (backlog): WebAuthn/FIDO2 como opcion adicional de segundo factor. Candidato para fase futura.
- Perdida de dispositivo autenticador + codigos de recuperacion agotados requiere intervencion manual de soporte.
- Dispositivo compartido del conductor — mitigado con logout guard, gestion de sesiones.
- `X-Forwarded-For` sin sanitizar detras de proxy no confiable.
- 2 advisories transitivas restantes (`effect` via Prisma CLI, `postcss` via Next+geist) — NOT_REACHABLE en runtime.

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md`.
