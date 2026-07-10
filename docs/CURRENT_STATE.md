# CURRENT STATE

Fecha: 2026-07-10

## Fase actual

Auditoría independiente + remediación P0/P1 completada. Rotación de sesión post-login, recuperación de contraseña con Mailpit, gestión de sesiones activas y actualización de AWS SDK (cerró 7 advisories) implementadas y verificadas.

## Implementado (fase actual)

- **Migración** `20260710080000_session_metadata_and_reset_revocation` (aplicada): agrega `sessions.user_agent`, `sessions.ip_hash`, `sessions.last_seen_at`, `password_reset_tokens.revoked_at` y `password_reset_tokens.requested_ip_hash`; índice `(user_id, created_at)` en `password_reset_tokens`.
- **VULN-001 (P0) corregida**: `processOfflineBatch` ahora crea el `offlineCommandReceipt` como PRIMER paso de la transacción con `create` (no `upsert`), forzando el UNIQUE a fallar antes de mutar `trip` o crear `tripEvent`. Segundos requests concurrentes con la misma clave reciben `DUPLICATE` con el resultado ganador.
- **VULN-002 (P1) corregida**: `signIn` revoca la sesión asociada a la cookie previa antes de crear la nueva; nueva sesión persiste `userAgent` + `ipHash` + `lastSeenAt`.
- **VULN-003 + VULN-004 (P1) corregidas**: flujo completo de recuperación de contraseña:
  - `src/lib/server/password-reset.ts` (request, validate, consume, prune).
  - `src/lib/server/password-reset-actions.ts` con rate limit doble.
  - Rutas `/recuperar` y `/recuperar/[token]` con `noindex` + `force-dynamic`.
  - Consumo del token invalida TODAS las sesiones del usuario (`revokeAllUserSessions`).
- **VULN-005 (P1) corregida**: `/account/sessions` con listado, cerrar una, cerrar todas las demás, cerrar todas. `SessionSummary` no expone tokens ni hashes.
- **VULN-007 (P2) corregida**: `currentServerState` ya no viaja en respuestas `ASSIGNMENT_CHANGED` (evita enumeración cross-driver).
- **VULN-DEP-001 (P1)**: `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` actualizados a `3.1083.0`; el nuevo `@aws-sdk/xml-builder@3.972.34` ya no depende de `fast-xml-parser`. **7 advisories cerradas** (1 crítica + 4 altas + 2 moderadas).
- **VULN-DEP-002 y VULN-DEP-003**: documentadas en `docs/DEPENDENCY_REACHABILITY.md` como NOT_REACHABLE (build-time only, sin ruta de explotación en nuestro uso).
- **Login**: enlace "Olvide mi contrasena" agregado; banner de éxito tras reset (`?password-reset=ok`).
- **`revokeAllUserSessions`, `revokeSessionById`, `revokeOtherSessions`, `getCurrentSession`** expuestos desde `src/lib/server/auth.ts`.
- **Logger + redacción**: sin cambios; ya cubría el escenario.
- **Scripts** — `pnpm security:check` ampliado: 15 comprobaciones (rotación de sesión, `revokeAllUserSessions`, reset persiste solo hash, `/recuperar/[token]` con noindex, rate limit doble en reset actions).
- **Documentación** — `docs/CLAUDE_SECURITY_AUDIT.md`, `docs/SECURITY_REMEDIATION_PLAN.md`, `docs/AUTHENTICATION_SECURITY.md`, `docs/SESSION_MANAGEMENT.md`, `docs/DEPENDENCY_REACHABILITY.md`, ADR-009 (rotación/revocación), ADR-010 (recuperación).

## Base preservada

- Next.js App Router con TypeScript estricto.
- Docker (PostgreSQL 5433, MinIO, Mailpit) saludable.
- Autenticación Argon2id + sesiones opacas SHA-256 + cookies httpOnly SameSite Lax.
- Flujo operativo completo cliente → operaciones → conductor → evidencia → POD → cierre.
- Cola offline del conductor con idempotencia server-side.
- Firma real embebida en el POD PDF.
- Aislamiento multitenant server-side (guards y filtros por `tenantId`).
- 19 E2E previos.

## Riesgos residuales documentados

- Dispositivo compartido del conductor y del usuario administrativo — mitigado con logout guard, gestión de sesiones y advertencias en UI.
- `X-Forwarded-For` sin sanitizar detrás de proxy no confiable — documentado en `DEPENDENCY_REACHABILITY.md`; requiere configuración correcta al desplegar.
- 2 advisories transitivas restantes (`effect` vía Prisma CLI, `postcss` vía Next+geist) — NOT_REACHABLE en runtime; revisión trimestral.
- Sin escaneo AV real, sin 2FA, sin recuperación externa por SMS/WhatsApp.

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md`.
