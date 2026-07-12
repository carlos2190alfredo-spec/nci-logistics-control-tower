# CURRENT STATE

Fecha: 2026-07-12

## Fase actual

Backups cifrados con restauracion verificada completados. Sistema de backup AES-256-GCM para PostgreSQL, MinIO y configuracion con DR drill que prueba el ciclo completo de backup → verificacion → restauracion → limpieza.

## Implementado (fase actual — Backups cifrados)

- **Modulo criptografico** (`scripts/backup/crypto.ts`): AES-256-GCM con magic header `NCIBAK01`, IV aleatorio, AuthTag. SHA-256 para checksums. Dumps sin cifrar eliminados automaticamente.
- **Backup PostgreSQL**: `pg_dump` via Docker, SHA-256, cifrado, manifiesto. Restore a DB aislada `nci_logistics_restore_test` con verificacion de tablas criticas.
- **Backup MinIO**: descarga de todos los objetos, tar, SHA-256, cifrado. Restore a bucket aislado `nci-logistics-restore-test` con verificacion de conteo.
- **Backup configuracion**: bundle JSON (docker-compose, package.json, schema, tsconfig, next.config, playwright.config, .env.example). Excluye `.env.local` y archivos con secretos.
- **Sistema de manifiestos**: version, timestamp, hostname, entradas con checksums originales y cifrados, tamanos.
- **Verificacion de integridad**: `pnpm backup:verify` valida checksums sin restaurar.
- **DR drill**: `pnpm backup:drill` ejecuta backup + verify + restore + cleanup completo. Ultimo drill: PASS (37 tablas, 68 objetos, 3.0 MB cifrados, 7.4s).
- **Tests**: 21 tests unitarios nuevos (104 total). 5 verificaciones de seguridad nuevas (37 total).
- **Documentacion**: ADR-020, BACKUP_ARCHITECTURE.md, BACKUP_RETENTION_POLICY.md, DISASTER_RECOVERY_RUNBOOK.md, BACKUP_RESTORE_DRILL_LATEST.md.

## Base preservada

- Next.js App Router con TypeScript estricto.
- Docker (PostgreSQL 5433, MinIO, Mailpit, ClamAV 3310) saludable.
- Autenticacion Argon2id + sesiones opacas SHA-256 + cookies httpOnly SameSite Lax.
- MFA TOTP con AES-256-GCM, sesiones parciales, enforcement por rol.
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

- **MFA-VULN-008** (backlog): WebAuthn/FIDO2 como opcion adicional de segundo factor.
- Perdida de dispositivo autenticador + codigos de recuperacion agotados requiere intervencion manual.
- Perdida de `BACKUP_ENCRYPTION_KEY` impide restaurar backups existentes.
- Dispositivo compartido del conductor — mitigado con logout guard, gestion de sesiones.
- `X-Forwarded-For` sin sanitizar detras de proxy no confiable.
- 2 advisories transitivas restantes (`effect` via Prisma CLI, `postcss` via Next+geist) — NOT_REACHABLE en runtime.

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md`.
