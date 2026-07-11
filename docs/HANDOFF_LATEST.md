# HANDOFF LATEST

Fecha: 2026-07-11
Agente: Claude Opus 4.6 (PWA instalable, fotos offline, sync engine, attachment receipts)

## Objetivo de la sesion

Completar la PWA del conductor como aplicacion instalable con soporte offline real: PWA manifest con iconos, service worker con actualizaciones controladas, captura de fotos con EXIF stripping y almacenamiento en IndexedDB, motor de sincronizacion con backoff exponencial, endpoint de upload con idempotencia via AttachmentReceipt, y vinculacion de fotos AVAILABLE con evidencia y POD.

## Fases completadas

| Fase | Commit | Descripcion |
| --- | --- | --- |
| A | 8879daf | Auditoria PWA y offline (19 hallazgos documentados) |
| B | 34a0ef6 | PWA instalable (manifest, iconos PNG, SW controlado, offline fallback) |
| C | 8f44b90 | Integracion photo-store en UI conductor (captura, EXIF strip, thumbnails) |
| D | 536bd37 | Endpoint attachment con AttachmentReceipt idempotente |
| E | d84048d | PhotoSyncEngine con backoff, polling de cuarentena, cleanup |
| F | 9ecdc54 | Conexion fotos AVAILABLE con evidencia y POD |
| G | 4c059a3 | Tests: 6 unit + 13 E2E nuevos (53 unit + 46 E2E total) |
| H | (actual) | ADR-015, ADR-016, ADR-017, handoff |

## Arquitectura implementada

### PWA (ADR-015)
- `manifest.webmanifest`: instalable, standalone, iconos PNG 192/512/maskable
- `sw.js`: cache-first para shell, network-only para APIs, offline fallback
- `register-service-worker.tsx`: actualizaciones controladas, banner install/update
- Guard contra recarga en primera instalacion del SW

### Fotos offline (ADR-016)
- IndexedDB `nci-lct-photos` separada de la cola de comandos
- Aislamiento por `ownerKey` (userId::tenantId::driverId)
- EXIF stripping cliente: APP1, APP2, APP12, APP13, COM
- SHA-256 content hash, thumbnails via OffscreenCanvas
- Quota: 50 fotos/owner, 10 MB/foto, 7 dias TTL

### Sync engine
- `photo-sync-engine.ts`: upload via FormData, max 2 concurrentes
- Backoff exponencial: 1s-16s, max 5 intentos
- Polling cuarentena cada 10s, cleanup AVAILABLE a 24h
- Integrado en OfflineProvider (30s ciclo + online trigger)
- Barra de estado con conteos y boton manual

### Attachment receipts (ADR-017)
- `POST /api/t/[slug]/driver/attachment`: multipart upload idempotente
- `GET /api/t/[slug]/driver/attachment?idempotencyKey=...`: status check
- `@@unique([tenantId, userId, idempotencyKey])` previene duplicados
- Origin validation, rate limit 20/60s, driver/trip authorization
- Pipeline: upload → scan → Document record

### Vinculacion evidencia-POD
- Evidence form pasa fileAttachmentIds de fotos AVAILABLE
- `submitProofAction` valida FileAttachments y vincula Documents al proof
- POD PDF ya filtra por AVAILABLE (ADR-014)

## Archivos nuevos/modificados clave

| Archivo | Descripcion |
| --- | --- |
| `public/manifest.webmanifest` | Manifest PWA con iconos y metadata |
| `public/sw.js` | Service worker con cache controlado |
| `public/icons/*.png` | Iconos PWA generados |
| `src/components/register-service-worker.tsx` | Update/install banners |
| `src/app/offline/page.tsx` | Pagina offline fallback |
| `src/lib/offline/photo-store.ts` | IndexedDB fotos, EXIF strip, hash |
| `src/lib/offline/photo-sync-engine.ts` | Motor de sincronizacion |
| `src/components/offline/evidence-photo-capture.tsx` | UI captura fotos |
| `src/components/offline/evidence-form.tsx` | Form evidencia con fotos |
| `src/app/api/t/[tenantSlug]/driver/attachment/route.ts` | Endpoint upload |
| `tests/e2e/pwa-photo-sync.spec.ts` | 13 E2E tests |
| `src/lib/offline/photo-store.test.ts` | 6 unit tests EXIF |
| `docs/decisions/ADR-015..017` | Decisiones arquitectonicas |

## Verificaciones finales

- TypeScript: sin errores
- ESLint: sin errores ni warnings
- Unit tests: 53/53 (11 archivos)
- E2E tests: 46/46
- Security tests: 4/4
- Production build: exitoso
- Working tree: limpio (despues de commit final)

## Restricciones cumplidas

- No se cachean APIs autenticadas, signed URLs, ni secretos en IndexedDB
- No se confian tenantId/driverId/userId/roles del navegador
- No se debilita aislamiento multitenant
- No se hardcodea Panatruck
- No se editan migraciones aplicadas
- No se usa `any` para silenciar TypeScript
- No se eliminan ni desactivan pruebas existentes
- Toda la interfaz en espanol
- 33 E2E originales intactos; total incremento a 46
- No push, no remote

## Pendiente para produccion

1. Configurar ClamAV TCP en produccion (127.0.0.1:3310)
2. Configurar MinIO o S3 con bucket real
3. Revisar politica de retencion de fotos (actualmente 7 dias local, 24h post-AVAILABLE)
4. Considerar notificaciones push para conductores (SW ya registrado)
5. Prueba de campo offline real con dispositivo Android
