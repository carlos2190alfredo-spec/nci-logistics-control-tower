# Auditoria de Cierre — Pipeline de Archivos y Fotografias Offline

Fecha: 2026-07-10
Commit base: `71aa358`
Auditor: Claude Opus 4.6 (verificacion adversarial independiente)

## A. CLAMAV

| Punto | Estado | Evidencia |
|---|---|---|
| Contenedor saludable | VERIFICADO | `docker compose ps` muestra healthy, `echo PING \| nc localhost 3310` responde PONG |
| clamd responde a PING | VERIFICADO | `ClamAVProvider.ping()` envia `zPING\0`, parsea PONG |
| Actualizacion de firmas | VERIFICADO | imagen `clamav/clamav:1.4` ejecuta freshclam automaticamente |
| Puerto solo red interna | DEFECTO | `docker-compose.yml:65` expone `3310:3310` al host; deberia ser solo red `nci-local` |
| Comportamiento si caido | VERIFICADO | `scanFile()` llama `av.ping()`, si false → status PENDING_SCAN, throw AV_UNAVAILABLE |
| Timeout | VERIFICADO | `CLAMAV_TIMEOUT_MS = 30_000` en socket |
| Limite de tamano | PARCIAL | Validacion previa en `validateUploadedFile` (5MB), pero `scanFile` no tiene limite propio |
| Stream vs buffer | VERIFICADO | Usa INSTREAM protocol con `buildInstreamCommand()` que envia buffer completo |
| ERROR marcado CLEAN | VERIFICADO | `parseInstreamResponse()` retorna ERROR si no match OK ni FOUND; `scanFile` mapea ERROR a PENDING_SCAN |

## B. CUARENTENA

| Punto | Estado | Evidencia |
|---|---|---|
| Todo archivo de usuario entra en cuarentena | VERIFICADO | `submitProofAction` usa `processUploadThroughPipeline()` que llama `quarantineUpload()` |
| Rutas que cargan directo al bucket final | DEFECTO | `approveProofAction:726` usa `uploadBuffer()` directamente para POD PDF, sin pipeline. Justificado como documento generado internamente pero no documentado como politica |
| ObjectKeys generados en servidor | VERIFICADO | `targetKey` construido en `actions.ts:624` con `tenant.slug`, `trip.reference`, `Date.now()` y `filename` limpio |
| Validacion de tenant | VERIFICADO | `requireTenantMembership(tenantSlug)` en `submitProofAction` |
| Validacion de viaje | VERIFICADO | `trip.findFirstOrThrow({ where: { id: tripId, tenantId: tenant.id } })` |
| Validacion de conductor | VERIFICADO | `driver.userId === user.id` check en `submitProofAction:606` |
| Eliminacion de cuarentena tras promocion | VERIFICADO | `promoteFile()` ejecuta `CopyObject` luego `DeleteObject` en quarantine key |
| Deteccion de huerfanos | NO IMPLEMENTADO | No existe limpieza de archivos en cuarentena sin FileAttachment ni archivos antiguos |

## C. DESCARGAS

| Punto | Estado | Evidencia |
|---|---|---|
| Solo AVAILABLE obtiene signed URL | DEFECTO | `documents/[documentId]/route.ts:42-50` busca FileAttachment por filename match, no por relacion directa. Documentos legacy sin FileAttachment pasan libremente. La consulta `status: { notIn: ["AVAILABLE", "CLEAN"] }` es correcta para quarantined files pero no cubre legacy sin FileAttachment |
| Compatibilidad legacy permite archivos no escaneados | DEFECTO | Documentos creados antes de la migracion no tienen FileAttachment. El check `quarantined` devuelve null, se permite descarga sin escaneo |
| Proof download verifica estado | DEFECTO | `proof/[tripId]/route.ts` NO tiene check de FileAttachment. Sirve cualquier Document que cumpla tenant/customer/proof/pdf sin verificar estado de escaneo |
| Se usa documentId | VERIFICADO | Ambas rutas buscan por `id: documentId` o por `tripId` + filtros tenant/customer |
| ObjectKey manipulable | VERIFICADO | `objectKey` viene de DB, no del request |
| Auditoria de descarga | VERIFICADO | `audit()` en ambas rutas |
| Rate limit | VERIFICADO | 60/min para documentos, 30/min para proof |

## D. POD

| Punto | Estado | Evidencia |
|---|---|---|
| Consulta FileAttachment.status = AVAILABLE | NO IMPLEMENTADO | `generateProofOfDeliveryPdf` recibe `trip.documents` sin filtrar por FileAttachment status |
| Incluye Document legacy sin scan | DEFECTO | `trip.documents.filter(d => d.visibility === "CUSTOMER_VISIBLE")` lista documentos legacy sin verificar escaneo |
| Lee cuarentena | VERIFICADO (seguro) | No lee objectKey de cuarentena; solo lista filenames de documentos existentes |
| Bloquea aprobacion si archivo pendiente | NO IMPLEMENTADO | `approveProofAction` no verifica que todas las evidencias tengan FileAttachment AVAILABLE |
| Bloquea cierre si falta analisis | NO IMPLEMENTADO | Sin verificacion de escaneo completo antes de aprobacion |

## E. FOTOGRAFIAS OFFLINE

| Punto | Estado | Evidencia |
|---|---|---|
| photo-store.ts conectado a la PWA | NO IMPLEMENTADO | Modulo `photo-store.ts` es "use client" pero ningun componente lo importa. `grep -r "photo-store" src/components/` devuelve 0 resultados |
| Captura guarda Blob | NO IMPLEMENTADO | No hay UI para captura de fotos offline |
| Persiste tras recarga | NO VERIFICABLE | No hay UI para probar |
| Aislamiento por ownerKey | VERIFICADO (codigo) | `listPhotosForOwner(ownerKey)` filtra por ownerKey en indice, pero sin integracion no hay prueba E2E |
| Se sincroniza | NO IMPLEMENTADO | No hay flujo de sincronizacion de fotos |
| Se elimina tras confirmacion | NO IMPLEMENTADO | No hay logica de cleanup post-sync |
| Maneja sesion expirada | NO IMPLEMENTADO | No hay handling de 401 en sync de fotos |
| Maneja reasignacion | NO IMPLEMENTADO | |
| Maneja cuota | VERIFICADO (codigo) | `storePhoto()` valida MAX_PHOTOS_PER_OWNER y MAX_PHOTO_BYTES |
| Elimina EXIF | VERIFICADO (codigo) | `stripExifClient()` existe y remueve APP1/APP2/APP12/APP13/COM |
| Evita duplicados | PARCIAL | `idempotencyKey` existe en schema pero `AttachmentReceipt` nunca se usa |

## F. IDEMPOTENCIA

| Punto | Estado | Evidencia |
|---|---|---|
| AttachmentReceipt se utiliza | NO IMPLEMENTADO | `grep -r "attachmentReceipt" src/lib/` devuelve 0 resultados en codigo de aplicacion (solo schema y migracion) |
| Restriccion unica existe | VERIFICADO | `@@unique([tenantId, userId, idempotencyKey])` en schema |
| Se compara hash | NO IMPLEMENTADO | No hay logica de comparacion de hash en attachment receipts |
| Se detecta payload alterado | NO IMPLEMENTADO | |
| Respuesta perdida produce duplicado | RIESGO ACEPTADO | Sin receipt, un reenvio crearia segundo FileAttachment y Document |
| Dos requests simultaneos producen unico documento | RIESGO ACEPTADO | Sin constraint adicional, posible duplicado |

## G. CLEANUP

| Punto | Estado |
|---|---|
| Existe script de cleanup | NO IMPLEMENTADO |
| Existe dry-run | NO IMPLEMENTADO |
| Maneja cuarentena infectada | NO IMPLEMENTADO |
| Maneja uploads incompletos | NO IMPLEMENTADO |
| Maneja blobs locales sincronizados | NO IMPLEMENTADO |

## Resumen de hallazgos

| ID | Severidad | Hallazgo |
|---|---|---|
| CLOSURE-001 | ALTA | Descarga de documentos no verifica FileAttachment por relacion directa; legacy bypass |
| CLOSURE-002 | ALTA | Descarga de POD PDF no tiene check de FileAttachment |
| CLOSURE-003 | ALTA | photo-store.ts es codigo muerto — sin integracion en PWA |
| CLOSURE-004 | ALTA | AttachmentReceipt nunca se usa — idempotencia de fotos no implementada |
| CLOSURE-005 | MEDIA | POD incluye documentos sin verificar estado de escaneo |
| CLOSURE-006 | MEDIA | approveProofAction sube PDF directo sin pipeline — sin politica documentada |
| CLOSURE-007 | MEDIA | No existen scripts de cleanup ni migracion legacy |
| CLOSURE-008 | BAJA | ClamAV puerto expuesto al host (solo desarrollo local) |
| CLOSURE-009 | BAJA | No existe limite de tamaño propio en scanFile (depende de validacion previa) |
