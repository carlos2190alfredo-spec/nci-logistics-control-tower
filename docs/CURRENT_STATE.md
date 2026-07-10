# CURRENT STATE

Fecha: 2026-07-09 (fase offline + hardening)

## Fase actual

Fase offline del conductor + hardening de seguridad implementada sobre la base operacional E2E y el rediseño visual: cola persistente en IndexedDB con idempotencia server-side, endpoint dedicado con Origin/Host/rate-limit/whitelist, headers de seguridad globales, uploads con magic bytes, firma real embebida en el POD PDF, service worker seguro, logger con redacción, códigos de error seguros, `pnpm security:*` funcional.

## Implementado (fase actual)

- **Migración** `20260709180000_offline_sync_and_rate_limit` (aplicada) con tablas `offline_command_receipts` (unicidad `tenant_id + user_id + idempotency_key`, TTL 30 días) y `rate_limit_buckets` (unicidad `scope + key`).
- **Servidor** — `src/lib/server/offline-sync.ts` (procesamiento por lote con `payload_hash`), `src/lib/server/rate-limit.ts` (`PostgresRateLimitProvider`, contrato `RateLimitProvider`), `src/lib/server/logger.ts` (redacción centralizada), `src/lib/server/errors.ts` (códigos seguros), `src/lib/server/http-security.ts` (Origin/Host y content-type), refuerzo de `src/lib/server/storage.ts` (magic bytes, TTL 60 s, content-disposition, `isValidSignaturePng`).
- **Endpoint** `POST /api/t/[tenantSlug]/driver/sync` con Origin whitelist, content-type JSON, `content-length ≤ 512 KB`, lote ≤ 25 comandos, rate limit 30/min por (tenant, user, IP), Zod discriminado, whitelist de acciones y transiciones DRIVER, resultado por comando.
- **Cliente offline** — `src/lib/offline/{db,queue,protocol,sync-client,store,hooks}.ts` con IndexedDB aislado por owner (`userId::tenantId::driverId`), backoff exponencial 5s→5m, canonicalización determinista del payload.
- **UI conductor** — `OfflineProvider`, `SyncStatus`, `PendingActionsPanel`, `OfflineTransitionButton` (encola + sync + `router.refresh()`), `OfflineIncidentFormClient`, `LogoutGuard` (form action + guard con acciones pendientes).
- **POD PDF** — Firma capturada como data URL PNG con longitud mínima 200 B; embebida vía `doc.image(dataUrl, ...)` con `pdfkit.standalone`; nota de captura con receptor y timestamp.
- **SignaturePad** — sin trazo demo; marca digital de captura en cada firma.
- **next.config.ts** — CSP con `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`, `/api/*` con `Cache-Control: no-store`.
- **public/sw.js v2** — no cachea `/api/`, `/platform`, `/t/`, MinIO; elimina caches viejos; solo shell público.
- **Login** — rate limit 10/min por correo + delay constante 250 ms.
- **Descargas** — rate limit por (tenant, user, IP), auditoría `document.download` / `proof.download`, TTL 60 s, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- **Dependencia** — `nodemailer` 7.0.11 → 9.0.3 (parches SMTP command injection y CRLF headers).
- **Scripts** — `pnpm security:check`, `pnpm security:test`, `pnpm security:audit`.
- **Documentación** — [THREAT_MODEL](docs/THREAT_MODEL.md), [OFFLINE_ARCHITECTURE](docs/OFFLINE_ARCHITECTURE.md), [OFFLINE_SECURITY](docs/OFFLINE_SECURITY.md), [SECURITY_HARDENING](docs/SECURITY_HARDENING.md), [SECURITY_CHECKLIST](docs/SECURITY_CHECKLIST.md), [INCIDENT_RESPONSE](docs/INCIDENT_RESPONSE.md), [ADR-007](docs/decisions/ADR-007-offline-command-and-idempotency-model.md), [ADR-008](docs/decisions/ADR-008-security-baseline-and-rate-limiting.md); [security.md](docs/security.md) reescrito.

## Base preservada

- Next.js App Router con TypeScript estricto.
- Docker (PostgreSQL 5433, MinIO, Mailpit) saludable.
- Autenticación local Argon2id con sesiones opacas (SHA-256 en DB, cookie `httpOnly` `SameSite=Lax`).
- Flujo operativo completo cliente → operaciones → conductor → evidencia → POD → cierre.
- Sistema de diseño (docs/DESIGN_SYSTEM.md), shells por perfil, estados del dominio en español.
- 10 E2E previos (login/logout, aislamiento multitenant, aislamiento por cliente, restricción de conductor, flujo E2E con POD + controles negativos).

## Riesgos residuales documentados

- Dispositivo compartido del conductor: la cola persiste hasta logout/purga (documentado en THREAT_MODEL y OFFLINE_SECURITY).
- Vulnerabilidades transitivas: `fast-xml-parser` (via AWS SDK), `postcss` (via Next), `effect` (via Prisma). Sin ruta directa de explotación; esperan parche upstream.
- Sin escaneo AV real: uploads validan magic bytes; abstracción `PENDING_SCAN → CLEAN/REJECTED` para ClamAV local futuro.
- Recuperación de contraseña con Mailpit no implementada.
- Rotación de sesión post-login no implementada (defensa adicional contra fixation).

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md`.
