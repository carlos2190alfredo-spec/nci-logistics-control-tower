# Arquitectura del Pipeline de Cuarentena de Archivos

## Flujo de upload

```
Browser
  → validateUploadedFile (MIME whitelist, magic bytes, size)
  → stripExif (JPEG only, remove GPS/EXIF/IPTC/COM)
  → uploadBuffer(quarantine/{targetKey})
  → FileAttachment.create(status: QUARANTINE)
  → ClamAV.ping() → fail-closed si no disponible
  → ClamAV.scan(INSTREAM)
  → FileScanEvent.create(verdict, detail, durationMs)
  ├── CLEAN → CopyObject(quarantine→production) → DeleteObject(quarantine) → status: AVAILABLE
  ├── INFECTED → DeleteObject(quarantine) → status: REJECTED
  └── ERROR → status: PENDING_SCAN (retry posterior)
```

## Flujo de download

```
GET /api/t/{slug}/documents/{id}
  → requireCustomerMembership
  → enforceRateLimit
  → Document.findFirst(tenantId, customerAccountId, CUSTOMER_VISIBLE)
  → FileAttachment check: if status NOT IN (AVAILABLE, CLEAN) → 403
  → getSignedReadUrl(objectKey, TTL 60s)
  → 303 redirect con no-store
```

## ClamAV

- Imagen: `clamav/clamav:1.4`
- Puerto: 3310 (clamd TCP)
- Protocolo: zINSTREAM (null-terminated)
- Health check: `echo PING | nc localhost 3310 | grep -q PONG`
- Timeout: 30 segundos
- Fail-closed: si ping falla, archivo queda en QUARANTINE

## Modelo de datos

### FileAttachment

| Campo | Tipo | Descripcion |
|---|---|---|
| status | FileStatus | Estado actual del pipeline |
| quarantineKey | String | Key en MinIO durante cuarentena |
| objectKey | String? | Key en produccion (solo si AVAILABLE) |
| scanVerdict | ScanVerdict? | Resultado del ultimo escaneo |
| scanDetail | String? | Detalle del escaneo (nombre del virus, etc.) |
| scannedAt | DateTime? | Timestamp del escaneo |
| promotedAt | DateTime? | Timestamp de promocion a produccion |
| rejectedAt | DateTime? | Timestamp de rechazo |

### Estados

```
PENDING_UPLOAD → QUARANTINE → SCANNING → CLEAN → AVAILABLE
                                       → INFECTED → REJECTED
                             → PENDING_SCAN (error, retry)
```

## EXIF Stripping

Se eliminan los siguientes marcadores JPEG:
- APP1 (0xE1): Exif, GPS, MakerNote
- APP2 (0xE2): ICC Profile
- APP12 (0xEC): Picture Info
- APP13 (0xED): IPTC/Photoshop
- COM (0xFE): Comments

Se preserva APP0 (0xE0, JFIF) ya que contiene metadata necesaria para renderizar la imagen.
