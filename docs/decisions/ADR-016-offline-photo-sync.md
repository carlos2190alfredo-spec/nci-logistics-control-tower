# ADR-016: Flujo de sincronizacion de fotos offline

**Estado:** Aceptado  
**Fecha:** 2026-07-11  
**Contexto:** Sincronizacion de fotos capturadas offline con pipeline de cuarentena

## Contexto

Los conductores capturan fotos de evidencia en zonas sin cobertura. Las fotos deben almacenarse localmente en IndexedDB, sincronizarse cuando hay conexion, pasar por el pipeline de cuarentena (ClamAV), y solo incluirse en el POD cuando alcanzan estado AVAILABLE.

## Decision

### Ciclo de vida de una foto

```
LOCAL_PENDING → READY_TO_UPLOAD → UPLOADING → UPLOADED_QUARANTINE → AVAILABLE
                                      ↓
                                    FAILED (reintentable hasta 5 veces)
                                    CONFLICT (rechazado por servidor)
```

### IndexedDB separada

Las fotos se almacenan en una base IndexedDB independiente (`nci-lct-photos`) con:
- Aislamiento por `ownerKey` (`userId::tenantId::driverId`)
- Indices: `owner_status`, `owner_trip`
- Quota: max 50 fotos por owner, max 10 MB por foto
- TTL: auto-purge despues de 7 dias
- Blobs almacenados directamente (no base64)

### Procesamiento cliente

Antes de almacenar en IndexedDB:
1. Validar tipo (JPEG/PNG/WEBP) y tamano (max 10 MB)
2. **EXIF stripping** para JPEG: eliminar APP1 (Exif), APP2 (ICC), APP12, APP13 (IPTC), COM
3. Generar `contentHash` via `crypto.subtle.digest("SHA-256")`
4. Generar `thumbnailDataUrl` via OffscreenCanvas (max 120px)
5. Asignar `idempotencyKey` unico (UUID)

### PhotoSyncEngine

Motor de sincronizacion (`photo-sync-engine.ts`):
- Recoge fotos en estado `READY_TO_UPLOAD`
- Sube via `POST /api/t/[tenantSlug]/driver/attachment` con FormData
- Max 2 uploads concurrentes
- Backoff exponencial: 1s, 2s, 4s, 8s, 16s (max 5 intentos)
- Polling de cuarentena cada 10s para fotos en `UPLOADED_QUARANTINE`
- Cleanup automatico de fotos AVAILABLE despues de 24h

### Integracion con OfflineProvider

El sync engine se ejecuta dentro del `OfflineProvider`:
- Ciclo automatico cada 30s
- Trigger en reconexion (`online` event)
- Boton manual "Reintentar sync" en barra de estado
- Estado reactivo: `syncing`, `lastResult` (uploaded/failed/pending)

### Seguridad

- No se cachean signed URLs, objectKeys ni tokens en IndexedDB
- EXIF stripping elimina metadatos de geolocalizacion y dispositivo
- contentHash permite deteccion de conflictos sin exponer datos del servidor
- idempotencyKey previene uploads duplicados

## Consecuencias

- Las fotos se capturan sin conexion y se sincronizan automaticamente
- El pipeline de cuarentena valida cada foto antes de marcarla AVAILABLE
- El POD solo incluye fotos AVAILABLE (filtrado en `generatePodPdf`)
- La barra de estado informa al conductor del progreso de sincronizacion
