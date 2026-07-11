# Auditoría PWA del Conductor y Sistema de Fotos Offline

**Fecha:** 2026-07-10
**Agente:** Claude Opus 4.6
**Objetivo:** Clasificar el estado de cada aspecto del PWA del conductor, el sistema de fotos offline, y el pipeline de attachment receipts antes de modificar funcionalidad.

## Baseline de verificación

| Verificación | Resultado |
|---|---|
| `docker compose ps` | 4/4 saludables (postgres, minio, mailpit, clamav) |
| `prisma migrate status` | 6 migraciones aplicadas, esquema al día |
| `pnpm lint` | Sin errores |
| `pnpm typecheck` | Sin errores |
| `pnpm test` | 47/47 tests unitarios |
| `pnpm test:e2e` | 33/33 tests E2E |
| `pnpm security:check` | 25/25 verificaciones |
| `pnpm files:health` | PASS (ClamAV + PG + MinIO) |
| `pnpm files:test:eicar` | PASS (EICAR detectado, limpio OK) |
| `pnpm build` | Exitoso |

## 1. PWA — Manifest

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| `manifest.webmanifest` existe | VERIFICADO | `public/manifest.webmanifest` | Presente y referenciado en `src/app/layout.tsx` |
| `name` y `short_name` | VERIFICADO | `public/manifest.webmanifest` | "NCI Logistics Control Tower" / "LCT" |
| `display: standalone` | VERIFICADO | `public/manifest.webmanifest` | Correcto |
| `start_url` | PARCIAL | `public/manifest.webmanifest` | Apunta a `/` (raíz). Debería apuntar a una ruta inteligente o al login para que el conductor llegue a su app tras instalar |
| `lang` | NO IMPLEMENTADO | `public/manifest.webmanifest` | Falta `"lang": "es"` |
| `categories` | NO IMPLEMENTADO | `public/manifest.webmanifest` | Falta `"categories": ["business", "logistics"]` |
| `shortcuts` | NO IMPLEMENTADO | `public/manifest.webmanifest` | Sin atajos definidos |
| Ícono PNG 192x192 | NO IMPLEMENTADO | — | Solo existe SVG (`/window.svg`) declarado como 192x192 |
| Ícono PNG 512x512 | NO IMPLEMENTADO | — | No existe |
| Ícono maskable | NO IMPLEMENTADO | — | No existe |
| `favicon.ico` | NO IMPLEMENTADO | — | No existe en `public/` |
| Directorio `public/icons/` | NO IMPLEMENTADO | — | No existe |

**Riesgo:** Sin íconos PNG, la PWA no es instalable en la mayoría de dispositivos Android. Chrome requiere al menos un ícono PNG de 192x192 y uno de 512x512 para mostrar el prompt de instalación.

## 2. PWA — Service Worker

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| Registro del SW | VERIFICADO | `src/components/register-service-worker.tsx` | Registra `/sw.js` en `useEffect` |
| Precache de shell | VERIFICADO | `public/sw.js` | Cachea `/`, `/login`, `/manifest.webmanifest` |
| Exclusión de rutas privadas | VERIFICADO | `public/sw.js` | Excluye `/api/`, `/platform`, `/t/` y hosts MinIO |
| Exclusión de respuestas no-OK | VERIFICADO | `public/sw.js` | Solo cachea `response.ok && response.type === "basic"` |
| Estrategia de cache | VERIFICADO | `public/sw.js` | Network-first con fallback a cache para GET públicos |
| Limpieza de caches viejos | VERIFICADO | `public/sw.js` | En `activate` elimina caches con key !== `CACHE_VERSION` |
| `self.skipWaiting()` | DEFECTO | `public/sw.js:19` | Se ejecuta inmediatamente en `install`. Debería ser controlado: no activar skipWaiting durante uploads de fotos |
| Fallback offline | NO IMPLEMENTADO | — | Sin página `/offline` ni respuesta offline para rutas no cacheadas |
| Notificación de actualización | NO IMPLEMENTADO | `src/components/register-service-worker.tsx` | No escucha `updatefound` ni `controllerchange`. El usuario no sabe cuándo hay una nueva versión |
| Prompt de instalación | NO IMPLEMENTADO | — | No captura `beforeinstallprompt`. Sin UI para instalar la PWA |
| Cache de assets estáticos | PARCIAL | `public/sw.js` | Solo cachea las 3 URLs de shell. Los assets de Next.js (`_next/static/`) no se precachean explícitamente (se cachean bajo demanda si se visitan online) |

**Defecto crítico:** `self.skipWaiting()` inmediato puede interrumpir uploads de fotos en curso, perdiendo datos del conductor.

## 3. Fotos Offline — IndexedDB Store

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| Módulo `photo-store.ts` | VERIFICADO | `src/lib/offline/photo-store.ts` | 234 líneas, API completa |
| Base de datos separada | VERIFICADO | `src/lib/offline/photo-store.ts` | `nci-lct-photos` (separada de `nci-lct-driver`) |
| CRUD completo | VERIFICADO | `src/lib/offline/photo-store.ts` | `storePhoto`, `getPhoto`, `updatePhoto`, `removePhoto` |
| Índices para consultas | VERIFICADO | `src/lib/offline/photo-store.ts` | `owner_status` y `owner_trip` |
| Límite por owner | VERIFICADO | `src/lib/offline/photo-store.ts` | Max 50 fotos |
| Límite por foto | VERIFICADO | `src/lib/offline/photo-store.ts` | Max 10 MB |
| TTL y purga automática | VERIFICADO | `src/lib/offline/photo-store.ts` | 7 días, `purgeExpiredPhotos()` |
| Purga por owner (logout) | VERIFICADO | `src/lib/offline/photo-store.ts` | `purgeOwnerPhotos()` |
| EXIF stripping client-side | VERIFICADO | `src/lib/offline/photo-store.ts` | `stripExifClient()` elimina APP1/APP2/APP12/APP13/COM |
| Integración en UI conductor | NO IMPLEMENTADO | — | `grep` confirma 0 imports desde componentes. Módulo huérfano |
| Captura de foto en formulario | PARCIAL | `src/app/t/[tenantSlug]/driver/page.tsx:148` | Usa `<input type="file">` estándar pero sin `capture="environment"`. No usa IndexedDB, sube directo al server |
| Procesamiento de imagen | NO IMPLEMENTADO | — | Sin resize, sin orientación EXIF, sin re-encode |
| Preview de foto capturada | NO IMPLEMENTADO | — | Sin thumbnail ni preview antes de enviar |
| Estado de foto en UI | NO IMPLEMENTADO | — | Sin indicador de estado (PENDING/UPLOADING/UPLOADED/FAILED) |
| Cuota UI | NO IMPLEMENTADO | — | Sin indicador visual de cuota (X/50 fotos) |

**Hallazgo principal:** `photo-store.ts` es un módulo completo pero completamente huérfano. El formulario de evidencia sube archivos directamente al servidor via `submitProofAction` sin pasar por IndexedDB ni el pipeline offline de fotos.

## 4. Fotos Offline — Estados y flujo

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| `PhotoStatus` definido | PARCIAL | `src/lib/offline/photo-store.ts:20` | Solo 4 estados: `PENDING`, `UPLOADING`, `UPLOADED`, `FAILED` |
| Estados intermedios | NO IMPLEMENTADO | — | Faltan: `LOCAL_PROCESSING`, `LOCAL_PENDING`, `READY_TO_UPLOAD`, `UPLOADED_QUARANTINE`, `SCANNING`, `AVAILABLE`, `CONFLICT` |
| Hash SHA-256 de contenido | NO IMPLEMENTADO | — | No se calcula hash del blob para idempotencia |
| `idempotencyKey` en OfflinePhoto | VERIFICADO | `src/lib/offline/photo-store.ts:31` | Campo existe pero no se usa en la práctica |
| Sync engine de fotos | NO IMPLEMENTADO | — | No existe `PhotoSyncEngine`. El sync client (`sync-client.ts`) solo sincroniza comandos de la cola offline, no fotos |

## 5. Pipeline de Archivos — Servidor

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| Quarantine upload | VERIFICADO | `src/lib/server/file-pipeline.ts` | `quarantineUpload()` → QUARANTINE prefix |
| ClamAV scan | VERIFICADO | `src/lib/server/file-pipeline.ts` | `scanFile()` con TCP INSTREAM |
| Promote file | VERIFICADO | `src/lib/server/file-pipeline.ts` | `promoteFile()` copia a producción, elimina quarantine |
| Reject file | VERIFICADO | `src/lib/server/file-pipeline.ts` | `rejectFile()` marca REJECTED |
| Full pipeline | VERIFICADO | `src/lib/server/file-pipeline.ts` | `processUploadThroughPipeline()` |
| Fail closed | VERIFICADO | `src/lib/server/file-pipeline.ts:91` | Si ClamAV no responde, archivo queda en QUARANTINE |
| EXIF strip server-side | VERIFICADO | `src/lib/server/file-pipeline.ts:33` | Solo para JPEG via `stripExif()` |
| Evidence upload vía pipeline | VERIFICADO | `src/lib/server/actions.ts:625` | `submitProofAction` usa `processUploadThroughPipeline` |
| Download gating | VERIFICADO | `src/app/api/t/[tenantSlug]/documents/[documentId]/route.ts` | Verifica FileAttachment.objectKey y status |
| POD gating | VERIFICADO | `src/app/api/t/[tenantSlug]/proof/[tripId]/route.ts` | Verifica FileAttachment status |
| POD solo AVAILABLE | VERIFICADO | `src/lib/server/pod-pdf.ts:106-116` | Filtra por FileAttachment AVAILABLE |

## 6. AttachmentReceipt — Idempotencia

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| Modelo Prisma | VERIFICADO | `prisma/schema.prisma:769-780` | `AttachmentReceipt` con `@@unique([tenantId, userId, idempotencyKey])` |
| Migración aplicada | VERIFICADO | — | `prisma migrate status` reporta esquema al día |
| Uso en pipeline | NO IMPLEMENTADO | `src/lib/server/file-pipeline.ts` | `processUploadThroughPipeline` no consulta ni crea receipts |
| Endpoints de attachment | NO IMPLEMENTADO | — | No existen rutas `/api/.../attachment/init`, `/content`, `/complete`, `/status` |
| Hash comparison | NO IMPLEMENTADO | — | Sin comparación de hash para detectar duplicados |
| Registros en DB | VERIFICADO | — | `files:health` reporta `AttachmentReceipts: 0` — tabla existe pero vacía |

## 7. Conductor — UI y UX

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| DriverShell | VERIFICADO | `src/components/shell/driver-shell.tsx` | Mobile-first, con ConnectivityIndicator |
| ConnectivityIndicator | VERIFICADO | `src/components/shell/connectivity-indicator.tsx` | `navigator.onLine` con `useSyncExternalStore`, aria-live |
| OfflineProvider | VERIFICADO | `src/components/offline/offline-provider.tsx` | Sync cada 45s + on-online + cleanup cada 5min |
| Cola offline (comandos) | VERIFICADO | `src/lib/offline/queue.ts` | Backoff exponencial, idempotencia, purga por owner |
| SyncStatus UI | VERIFICADO | `src/app/t/[tenantSlug]/driver/page.tsx:72` | Componente presente |
| PendingActionsPanel | VERIFICADO | `src/app/t/[tenantSlug]/driver/page.tsx:73` | Componente presente |
| OfflineTransitionButton | VERIFICADO | `src/app/t/[tenantSlug]/driver/page.tsx:118` | Transiciones offline |
| LogoutGuard | VERIFICADO | `src/app/t/[tenantSlug]/driver/page.tsx:55` | Advierte si hay pendientes |
| OfflineIncidentForm | VERIFICADO | `src/app/t/[tenantSlug]/driver/page.tsx:128` | Reportes de incidencia |
| SignaturePad | VERIFICADO | `src/components/signature-pad.tsx` | Canvas con pointer events, timestamp automático |
| Evidence form | PARCIAL | `src/app/t/[tenantSlug]/driver/page.tsx:142-158` | `<input type="file">` sin `capture="environment"`, sube directo online |
| Evidence offline | NO IMPLEMENTADO | — | La evidencia (foto + firma) requiere conexión. No se encola offline |

## 8. Sync — Endpoint servidor

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| Ruta sync | VERIFICADO | `src/app/api/t/[tenantSlug]/driver/sync/route.ts` | POST con validación completa |
| Origin validation | VERIFICADO | `route.ts:20-21` | `verifyMutationOrigin()` |
| Content-Type validation | VERIFICADO | `route.ts:23-24` | `requireJsonContentType()` |
| Body size limit | VERIFICADO | `route.ts:26-27` | 512 KB max |
| Rate limiting | VERIFICADO | `route.ts:31-42` | 30 req/60s por tenant:user:ip |
| Driver authorization | VERIFICADO | `route.ts:60-69` | Verifica driver pertenece al tenant y usuario |
| Batch processing | VERIFICADO | `route.ts:72-82` | `processOfflineBatch()` con idempotencia |
| Cache-Control | VERIFICADO | `route.ts:92` | `no-store` |
| Foto sync endpoint | NO IMPLEMENTADO | — | No existe endpoint para upload de fotos offline |

## 9. Seguridad

| Aspecto | Estado | Archivo | Detalle |
|---|---|---|---|
| SW no cachea privado | VERIFICADO | `public/sw.js` | Excluye `/api/`, `/t/`, MinIO |
| Sin secretos en IndexedDB | VERIFICADO | `src/lib/offline/db.ts`, `photo-store.ts` | Solo payloads de comandos y blobs de fotos |
| Sin objectKey en IndexedDB | VERIFICADO | `src/lib/offline/photo-store.ts` | OfflinePhoto no almacena objectKey ni signed URLs |
| ClamAV localhost only | VERIFICADO | `docker-compose.yml` | `127.0.0.1:3310:3310` |
| Sesión server-side | VERIFICADO | — | Cookies httpOnly, sameSite |
| Login revoca sesión previa | VERIFICADO | — | SEC-AUTH-001 pasa |
| Tenant isolation en sync | VERIFICADO | `route.ts:29` | `requireTenantRole()` |
| Driver isolation en sync | VERIFICADO | `route.ts:60-69` | Driver debe pertenecer al tenant+usuario |

## 10. Tests existentes relevantes

| Test | Estado | Archivo |
|---|---|---|
| OFFLINE-E2E-001..008 (8 tests) | VERIFICADO | `tests/e2e/offline-sync.spec.ts` |
| FILE-SEC-E2E-001..010 (10 tests) | VERIFICADO | `tests/e2e/file-security.spec.ts` |
| E2E-FLOW-001..004 (4 tests) | VERIFICADO | `tests/e2e/service-workflow.spec.ts` |
| SEC-AUTH-001..004 (4 tests) | VERIFICADO | `tests/e2e/auth-security.spec.ts` |
| Unit: exif-strip (5 tests) | VERIFICADO | `src/lib/server/exif-strip.test.ts` |
| Unit: antivirus (6 tests) | VERIFICADO | `src/lib/server/antivirus.test.ts` |
| Unit: protocol (5 tests) | VERIFICADO | `src/lib/offline/protocol.test.ts` |
| Unit: pod-pdf (4 tests) | VERIFICADO | `src/lib/server/pod-pdf.test.ts` |
| Unit: storage (7 tests) | VERIFICADO | `src/lib/server/storage.test.ts` |
| PWA E2E tests | NO IMPLEMENTADO | — |
| Offline photo E2E tests | NO IMPLEMENTADO | — |
| Attachment receipt E2E tests | NO IMPLEMENTADO | — |
| EXIF verification E2E test | NO IMPLEMENTADO | — |
| Photo sync concurrency tests | NO IMPLEMENTADO | — |

## Resumen de hallazgos por severidad

### DEFECTO (requiere corrección)

| ID | Hallazgo | Archivo | Impacto |
|---|---|---|---|
| PWA-001 | `self.skipWaiting()` inmediato en SW install | `public/sw.js:19` | Puede interrumpir uploads de fotos en curso |
| PWA-002 | Sin íconos PNG (solo SVG) | `public/manifest.webmanifest` | PWA no instalable en Android |
| PWA-003 | photo-store.ts no integrado en UI | `src/lib/offline/photo-store.ts` | Módulo huérfano, fotos no funcionan offline |
| PWA-004 | AttachmentReceipt no utilizado | `prisma/schema.prisma:769` | Sin idempotencia en uploads |

### PARCIAL (funciona pero incompleto)

| ID | Hallazgo | Archivo | Detalle |
|---|---|---|---|
| PWA-005 | Evidence form sin `capture="environment"` | `driver/page.tsx:148` | No abre cámara directamente en móvil |
| PWA-006 | PhotoStatus con solo 4 estados | `photo-store.ts:20` | Faltan estados intermedios del flujo completo |
| PWA-007 | SW registration sin update handling | `register-service-worker.tsx` | No notifica actualizaciones al usuario |
| PWA-008 | `start_url` genérico (`/`) | `manifest.webmanifest` | Debería dirigir al login o ruta del conductor |

### NO IMPLEMENTADO (requiere desarrollo)

| ID | Hallazgo | Detalle |
|---|---|---|
| PWA-009 | Offline fallback page | Sin `/offline` ni respuesta para rutas offline no cacheadas |
| PWA-010 | Install prompt UI | Sin captura de `beforeinstallprompt` ni botón de instalar |
| PWA-011 | Update banner UI | Sin notificación visual de nueva versión disponible |
| PWA-012 | PhotoSyncEngine | No existe motor de sincronización de fotos |
| PWA-013 | Attachment endpoints (init/content/complete/status) | No existen |
| PWA-014 | Image processing pipeline (resize, orientation, re-encode) | No existe |
| PWA-015 | Photo preview/thumbnail en UI | No existe |
| PWA-016 | Photo sync status en UI | No existe |
| PWA-017 | Quota indicator en UI | No existe |
| PWA-018 | Manifest lang, categories, shortcuts | No configurados |

### RIESGO ACEPTADO

| ID | Hallazgo | Detalle |
|---|---|---|
| PWA-019 | Assets Next.js no precacheados | Se cachean bajo demanda. Aceptable para MVP si el shell funciona offline |

## Decisiones de implementación recomendadas

1. **PWA-001**: Reemplazar `self.skipWaiting()` con sistema controlado que espera confirmación del cliente y verifica que no hay uploads en curso.
2. **PWA-002**: Generar íconos PNG 192x192, 512x512 y maskable a partir del SVG existente.
3. **PWA-003**: Integrar `photo-store.ts` en el formulario de evidencia del conductor, usando IndexedDB como buffer offline antes de sincronizar.
4. **PWA-004**: Implementar AttachmentReceipt en el flujo de upload para idempotencia, especialmente crítico con reconexiones móviles.
5. **PWA-012**: Crear PhotoSyncEngine que respete: backoff, concurrencia limitada, verificación de sesión, detección de conflictos.

## Archivos clave para las fases B-H

| Fase | Archivos a crear/modificar |
|---|---|
| B — PWA | `public/manifest.webmanifest`, `public/sw.js`, `src/components/register-service-worker.tsx`, `public/icons/` (nuevo) |
| C — Photo Store | `src/lib/offline/photo-store.ts`, `src/app/t/[tenantSlug]/driver/page.tsx`, componentes de captura (nuevos) |
| D — Attachment Receipts | `src/lib/server/file-pipeline.ts`, nuevas rutas API de attachment |
| E — Sync Engine | Nuevo `src/lib/offline/photo-sync.ts`, componentes de sync UI |
| F — Evidence/POD | `src/lib/server/actions.ts`, `src/lib/server/pod-pdf.ts` |
| G — Tests | Nuevos archivos en `tests/e2e/` y `src/lib/` |
| H — Documentación | `docs/decisions/ADR-015,016,017.md`, actualización de docs existentes |
