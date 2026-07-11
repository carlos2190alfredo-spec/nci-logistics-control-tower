# ADR-017: Receipts de attachment para uploads idempotentes

**Estado:** Aceptado  
**Fecha:** 2026-07-11  
**Contexto:** Idempotencia en uploads de evidencia del conductor

## Contexto

Los uploads de fotos desde dispositivos moviles pueden fallar a mitad de camino o reintentarse multiples veces (perdida de conexion, timeout, backoff del sync engine). Sin idempotencia, un reintento podria crear archivos duplicados en el sistema.

## Decision

### AttachmentReceipt como clave de idempotencia

El modelo `AttachmentReceipt` tiene un indice unico `@@unique([tenantId, userId, idempotencyKey])`:

```
AttachmentReceipt {
  id              UUID
  tenantId        UUID
  userId          UUID
  idempotencyKey  String
  fileAttachmentId UUID?
  status          String  // PROCESSING | COMPLETE | FAILED | REJECTED | PENDING_SCAN
  createdAt       DateTime
}
```

### Flujo del endpoint POST

1. Validar Origin (CSRF protection)
2. Rate limit: 20 requests / 60s por `tenant:user:ip`
3. Verificar autorizacion del conductor y asignacion del viaje
4. Buscar receipt existente por `(tenantId, userId, idempotencyKey)`:
   - Si existe con `COMPLETE`: retornar `DUPLICATE` con fileAttachmentId
   - Si existe con `PROCESSING`: retornar `PROCESSING`
   - Si existe con otro estado: retornar `DUPLICATE` con estado actual
5. Crear receipt con `PROCESSING`
6. Procesar via `processUploadThroughPipeline`:
   - Upload a MinIO
   - Scan ClamAV
   - Crear FileAttachment y Document
7. Actualizar receipt a `COMPLETE`, `REJECTED`, o `PENDING_SCAN`

### Flujo del endpoint GET

Permite al sync engine consultar el estado de un upload por `idempotencyKey`:
- Retorna estado del receipt y del FileAttachment asociado
- Usado para polling de cuarentena

### Vinculacion con evidencia

Al enviar evidencia (`submitProofAction`):
1. El formulario incluye `availablePhotoIds` (fileAttachmentIds de fotos AVAILABLE)
2. El servidor busca los FileAttachment por id, verificando `tenantId` y `status: AVAILABLE`
3. Busca los Document correspondientes por `objectKey`
4. Actualiza los Documents con `proofId` del proof creado

### Seguridad

- El conductor solo puede consultar receipts de su propio `userId`
- El servidor valida la asignacion del viaje (`trip.driverId === driver.id`)
- Los fileAttachmentIds enviados por el cliente se re-validan en el servidor
- Rate limiting previene abuso del endpoint de upload

## Consecuencias

- Los uploads son seguros de reintentar desde el sync engine
- No se crean archivos duplicados en MinIO/BD
- El conductor puede verificar el estado de cada upload
- La vinculacion proof-documento se valida en el servidor, no se confia en el cliente
