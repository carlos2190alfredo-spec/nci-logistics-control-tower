# Auditoria de Seguridad de Archivos — Baseline

Fecha: 2026-07-10
Commit base: `071cb54`
Auditor: Claude Opus 4.6

## 1. Resumen ejecutivo

El sistema actual permite subir archivos (evidencia de entrega) y descargarlos (documentos y POD). La validacion existe en capas (MIME whitelist, magic bytes, tamano) pero **no existe pipeline de cuarentena ni escaneo antivirus**. Los archivos subidos quedan disponibles inmediatamente despues del upload a MinIO.

### Hallazgos criticos

| ID | Severidad | Hallazgo | Ubicacion |
|---|---|---|---|
| FILE-001 | CRITICA | Archivos disponibles sin escaneo antivirus | `submitProofAction` en `actions.ts:622-629` |
| FILE-002 | ALTA | No existe cuarentena; archivos van directo al bucket de produccion | `uploadBuffer` en `storage.ts:111-126` |
| FILE-003 | ALTA | Download sirve archivos sin verificar estado de escaneo | `documents/[documentId]/route.ts:51-56` |
| FILE-004 | ALTA | POD incluye documentos sin verificar estado limpio | `approveProofAction` en `actions.ts:687-754` |
| FILE-005 | MEDIA | No hay registro de eventos de escaneo ni trazabilidad | Schema `Document` sin campo de estado de archivo |
| FILE-006 | MEDIA | `objectKey` se construye con input parcialmente controlado por usuario | `actions.ts:623` usa `filename` derivado de `file.name` |
| FILE-007 | BAJA | Sin limite de documentos por viaje o por tenant | Sin restriccion en `submitProofAction` |

## 2. Superficie de ataque actual

### 2.1 Puntos de entrada de archivos

| Punto | Archivo | Validacion actual |
|---|---|---|
| Evidencia de entrega | `src/lib/server/actions.ts:608` (`submitProofAction`) | `validateUploadedFile`: MIME whitelist (jpeg/png/webp/pdf), magic bytes, tamano 32B-5MB, extension |
| Firma digital (data URL) | `src/lib/server/actions.ts:606` | `isValidSignaturePng`: regex data URL PNG, min 200 bytes base64 |
| POD PDF (generado) | `src/lib/server/actions.ts:708-714` | Generado internamente por `generateProofOfDeliveryPdf` |

### 2.2 Puntos de salida de archivos

| Punto | Archivo | Proteccion actual |
|---|---|---|
| Descarga documento | `src/app/api/t/[tenantSlug]/documents/[documentId]/route.ts` | Auth (customerMembership), rate limit 60/min, tenant isolation, audit log, signed URL con TTL 60s, `no-store`, `Content-Disposition: attachment` |
| Descarga POD | `src/app/api/t/[tenantSlug]/proof/[tripId]/route.ts` | Auth (customerMembership), rate limit 30/min, tenant isolation, audit log, signed URL con TTL 60s, `no-store` |

### 2.3 Almacenamiento

| Aspecto | Estado actual |
|---|---|
| Backend | MinIO (S3-compatible) en `localhost:9000` |
| Bucket | `nci-logistics-local` (unico) |
| Estructura de keys | `tenants/{slug}/trips/{ref}/evidence/{timestamp}-{filename}` |
| Separacion cuarentena/produccion | **No existe** — todo va al mismo prefijo |
| Cifrado at-rest | Dependiente de config MinIO (no auditado) |
| Signed URLs | TTL 60s, `Content-Disposition: attachment` |
| Cache | `Cache-Control: no-store` en respuestas |

## 3. Validacion de uploads — analisis detallado

### Lo que esta bien

1. **Whitelist estricta de MIME types**: solo `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
2. **Magic bytes**: verificacion real del contenido del archivo vs. MIME declarado.
3. **Tamano**: minimo 32 bytes, maximo 5 MB.
4. **Nombre**: `safeFilename()` normaliza NFKD, elimina caracteres no-word, previene traversal.
5. **Extension vs. MIME**: validacion cruzada de extension contra whitelist.
6. **`Content-Disposition: attachment`**: previene renderizado inline en navegador.
7. **Signed URLs con TTL corto**: 60 segundos, sin persistencia.

### Lo que falta

1. **Escaneo antivirus**: ningun archivo se escanea antes de quedar disponible.
2. **Cuarentena**: archivos van directo al bucket accesible; un archivo malicioso queda descargable inmediatamente.
3. **Estado de archivo en DB**: el modelo `Document` no tiene campo de estado (PENDING, SCANNING, CLEAN, INFECTED).
4. **Eventos de escaneo**: no hay trazabilidad de cuando o como se escaneo un archivo.
5. **EXIF stripping**: las fotos conservan metadatos EXIF (GPS, dispositivo, etc.) que pueden exponer ubicacion del conductor.
6. **Limites por entidad**: sin restriccion de cantidad de documentos por viaje o por tenant.

## 4. Modelo `Document` actual (schema.prisma)

```
model Document {
  id                String             @id @default(uuid())
  tenantId          String             @map("tenant_id")
  customerAccountId String?
  tripId            String?
  proofId           String?
  filename          String
  mimeType          String             @map("mime_type")
  sizeBytes         Int                @map("size_bytes")
  bucket            String
  objectKey         String             @map("object_key")
  visibility        DocumentVisibility @default(INTERNAL)
  uploadedById      String?            @map("uploaded_by_id")
  createdAt         DateTime           @default(now())
}
```

**Campos ausentes para pipeline seguro:**
- `status` (enum: PENDING_UPLOAD, QUARANTINE, PENDING_SCAN, SCANNING, CLEAN, INFECTED, AVAILABLE, REJECTED)
- `quarantineKey` (objectKey en bucket/prefijo de cuarentena)
- `scannedAt` (timestamp del escaneo)
- `scanResult` (resultado del AV)
- `promotedAt` (cuando paso de cuarentena a produccion)

## 5. Flujo actual vs. flujo objetivo

### Actual (inseguro)
```
Browser → validateUploadedFile → uploadBuffer(produccion) → Document.create → disponible
```

### Objetivo (seguro)
```
Browser → validateUploadedFile → uploadBuffer(cuarentena) → FileAttachment.create(QUARANTINE)
  → ClamAV.scan → CLEAN → move(cuarentena → produccion) → status=AVAILABLE
  → INFECTED → status=REJECTED, log, alert
```

## 6. Riesgos identificados en download

1. **`documents/[documentId]/route.ts:51`**: `getSignedReadUrl(document.objectKey)` sirve el archivo sin verificar estado. Si el modelo tuviera un campo `status`, deberia filtrar solo `AVAILABLE` o `CLEAN`.
2. **`proof/[tripId]/route.ts:64`**: mismo patron — sirve sin verificar estado de escaneo.
3. **Redirect a signed URL**: el `303` redirige al browser directo a MinIO. Si MinIO esta expuesto, el browser hace GET a `localhost:9000`. En produccion esto debe estar detras de proxy.

## 7. Riesgo en objectKey

`actions.ts:623`:
```typescript
const objectKey = `tenants/${tenant.slug}/trips/${trip.reference}/evidence/${Date.now()}-${filename}`;
```

`tenant.slug` y `trip.reference` vienen del servidor (seguros). `filename` viene de `safeFilename(file.name)` que normaliza, pero el riesgo es bajo dado que `safeFilename` elimina `/`, `..` y caracteres no-word. **No es un hallazgo critico pero conviene que el objectKey no dependa del filename del usuario.**

## 8. Aislamiento multitenant en archivos

- **Upload**: `tenantId` viene de `requireTenantMembership(tenantSlug)` — correcto.
- **Download documentos**: filtra por `tenantId` Y `customerAccountId` — correcto.
- **Download POD**: filtra por `tenantId` Y `customerAccountId` Y `tripId` — correcto.
- **objectKey**: prefijo `tenants/{slug}/` alinea con tenant — correcto.
- **Sin RLS en MinIO**: el aislamiento depende de la logica de aplicacion, no del bucket. Acceptable en local pero riesgoso en produccion.

## 9. Recomendaciones para implementacion

1. **ClamAV en Docker** con health check, fail-closed si no disponible.
2. **AntivirusProvider** abstracto para testear con mock (EICAR).
3. **Migracion**: agregar `FileAttachment` con estados, `FileScanEvent` para trazabilidad, `AttachmentReceipt` para idempotencia offline.
4. **Prefijo de cuarentena** en MinIO: `quarantine/` separado de `tenants/`.
5. **Download** debe filtrar `status = 'AVAILABLE'` exclusivamente.
6. **POD** debe incluir solo fotos con `status = 'AVAILABLE'`.
7. **EXIF stripping** antes de almacenar: eliminar GPS, dispositivo, etc.
8. **Fotos offline en IndexedDB** como blobs, sync con receipts, quota management.
9. **Link a /account/sessions** en shells (driver y app).

## 10. Archivos que se modificaran

| Archivo | Cambio |
|---|---|
| `docker-compose.yml` | Agregar servicio ClamAV |
| `prisma/schema.prisma` | FileAttachment, FileScanEvent, AttachmentReceipt |
| `src/lib/server/storage.ts` | quarantine upload, promote, reject |
| `src/lib/server/antivirus.ts` | AntivirusProvider + ClamAVProvider |
| `src/lib/server/file-pipeline.ts` | initUpload, finalizeUpload, scanFile, promoteFile |
| `src/lib/server/actions.ts` | submitProofAction → usar pipeline |
| `src/app/api/t/.../documents/[documentId]/route.ts` | Filtrar status AVAILABLE |
| `src/app/api/t/.../proof/[tripId]/route.ts` | Filtrar status AVAILABLE |
| `src/lib/offline/photo-store.ts` | IndexedDB blobs, EXIF strip |
| `src/components/shell/driver-shell.tsx` | Link a sesiones |
| `src/components/shell/app-shell.tsx` | Link a sesiones |
| Tests y docs | Nuevos archivos |

## 11. Contratos que NO deben romperse

- E2E `SEC-AUTH-001..004` intocables.
- E2E `offline-sync` 9 tests intocables.
- `service-workflow.spec.ts` 4 tests intocables.
- `SessionSummary` sin secretos.
- Receipt-first transaction en offline-sync.
- `submitProofAction` debe seguir validando magic bytes y MIME.
- `Playwright workers: 1`.
