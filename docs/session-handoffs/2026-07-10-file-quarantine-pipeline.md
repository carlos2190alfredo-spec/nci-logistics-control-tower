# Session Handoff: File Quarantine Pipeline

Fecha: 2026-07-10
Agente: Claude Opus 4.6

## Resumen

Pipeline de cuarentena de archivos con ClamAV local, almacenamiento offline de fotos con EXIF removal, y escaneo antivirus obligatorio.

## Commits

- Infraestructura ClamAV + pipeline de cuarentena + fotos offline + tests + docs

## Archivos nuevos

- `src/lib/server/antivirus.ts`
- `src/lib/server/file-pipeline.ts`
- `src/lib/server/exif-strip.ts`
- `src/lib/offline/photo-store.ts`
- `src/lib/server/antivirus.test.ts`
- `src/lib/server/file-pipeline.test.ts`
- `src/lib/server/exif-strip.test.ts`
- `prisma/migrations/20260710224425_file_quarantine_pipeline/`
- `docs/decisions/ADR-011-file-quarantine-pipeline.md`
- `docs/decisions/ADR-012-offline-photo-storage.md`
- `docs/FILE_QUARANTINE_ARCHITECTURE.md`

## Archivos modificados

- `docker-compose.yml` (servicio ClamAV)
- `prisma/schema.prisma` (FileAttachment, FileScanEvent, AttachmentReceipt)
- `src/lib/server/actions.ts` (submitProofAction usa pipeline)
- `src/app/api/t/[tenantSlug]/documents/[documentId]/route.ts` (quarantine gate)
- `src/components/shell/shell-chrome.tsx` (link sesiones)
- `src/components/shell/driver-shell.tsx` (link sesiones)
- `src/lib/ui/status.ts` (etiquetas FileStatus)
- `scripts/security-check.ts` (5 checks nuevos)

## Verificacion

- 47/47 unit tests
- 23/23 E2E tests
- 20/20 security checks
- Build limpio
