# HANDOFF LATEST

Fecha: 2026-07-10
Agente: Claude Opus 4.6 (pipeline de cuarentena de archivos + ClamAV)

## Objetivo de la sesion

Implementar un pipeline de cuarentena de archivos con ClamAV local, almacenamiento offline de fotos en IndexedDB con EXIF removal, y escaneo antivirus obligatorio antes de cualquier acceso a archivos — sin romper el flujo operativo, el aislamiento multitenant ni las 23 pruebas E2E existentes.

## Cambios principales

### Infraestructura

- `docker-compose.yml` — servicio ClamAV (`clamav/clamav:1.4`, puerto 3310, healthcheck PING/PONG, volumen persistente `clamav_data`).

### Migracion

- `prisma/migrations/20260710224425_file_quarantine_pipeline/migration.sql`:
  - Enums `FileStatus` (8 estados) y `ScanVerdict` (3 valores).
  - Tabla `file_attachments` con status, quarantineKey, objectKey, scanVerdict, scanDetail, timestamps.
  - Tabla `file_scan_events` para trazabilidad de cada escaneo.
  - Tabla `attachment_receipts` para idempotencia de uploads offline.
  - Relaciones con `tenants`, `trips` y `proof_of_deliveries`.

### Servidor — Nuevos modulos

- `src/lib/server/antivirus.ts` — `AntivirusProvider` interface, `ClamAVProvider` (TCP INSTREAM protocol), inyeccion de dependencia via `getAntivirusProvider()`/`setAntivirusProvider()`.
- `src/lib/server/file-pipeline.ts` — `quarantineUpload()`, `scanFile()`, `promoteFile()`, `rejectFile()`, `processUploadThroughPipeline()`. Patron targetKey para preservar paths de objectKey.
- `src/lib/server/exif-strip.ts` — `stripExif()` remueve APP1/APP2/APP12/APP13/COM de JPEG.

### Servidor — Modificaciones

- `src/lib/server/actions.ts` — `submitProofAction` usa `processUploadThroughPipeline()` en lugar de upload directo; archivos INFECTED se rechazan sin crear Document.
- `src/app/api/t/[tenantSlug]/documents/[documentId]/route.ts` — GET verifica que FileAttachment tenga status AVAILABLE o CLEAN; retorna 403 si el archivo esta en cuarentena.

### Cliente — Nuevo modulo

- `src/lib/offline/photo-store.ts` — IndexedDB separada (`nci-lct-photos`), `stripExifClient()`, quota 50 fotos/owner, 10 MB/foto, TTL 7 dias, purgado automatico.

### UI

- `src/components/shell/shell-chrome.tsx` y `src/components/shell/driver-shell.tsx` — link a `/account/sessions` con icono Shield.
- `src/lib/ui/status.ts` — etiquetas y tonos en espanol para FileStatus.

### Verificaciones de seguridad

- `scripts/security-check.ts` — 5 verificaciones nuevas (20 total): quarantine prefix, fail-closed AV, EXIF strip, submitProof pipeline, shells link sessions.

### Tests

- `src/lib/server/file-pipeline.test.ts` — 8 tests de superficie de compilacion.
- `src/lib/server/antivirus.test.ts` — 6 tests (INSTREAM command, response parsing).
- `src/lib/server/exif-strip.test.ts` — 5 tests (strip markers, preserve non-JPEG).

### Documentacion

- `docs/decisions/ADR-011-file-quarantine-pipeline.md` — decision de arquitectura del pipeline.
- `docs/decisions/ADR-012-offline-photo-storage.md` — decision de almacenamiento offline de fotos.
- `docs/FILE_QUARANTINE_ARCHITECTURE.md` — arquitectura tecnica del pipeline.

## Resultados de verificacion

| Suite | Resultado |
| --- | --- |
| `pnpm verify` | Paso (lint + typecheck + 47 unit + build) |
| `pnpm test:e2e` | 23/23 (0 regresiones) |
| `pnpm security:check` | 20/20 |

## Principios de seguridad aplicados

- **Quarantine-first**: todo archivo sube a `quarantine/` en MinIO.
- **Fail-closed**: si ClamAV no responde, archivo queda en QUARANTINE (nunca AVAILABLE).
- **EXIF removal**: server-side y client-side antes de almacenar.
- **Download gate**: endpoint de descarga verifica status AVAILABLE/CLEAN.
- **No binarios en PostgreSQL**: archivos solo en MinIO.
- **No signed URLs en IndexedDB**: solo blobs con metadata.
- **No cookies/tokens en IndexedDB**: store separado exclusivo para fotos.

## Requisitos para el proximo agente

- Docker Desktop corriendo con ClamAV saludable (puede tardar 2-5 min en primera inicializacion).
- PostgreSQL en localhost:5433, MinIO en localhost:9000, Mailpit en localhost:8025.
- `pnpm install` y `pnpm exec prisma generate` antes de ejecutar.

## Estado

Working tree limpio. Sin remotes configurados. No se hizo push.
