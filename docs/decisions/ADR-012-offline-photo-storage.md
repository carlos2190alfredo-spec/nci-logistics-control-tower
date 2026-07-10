# ADR-012: Offline Photo Storage en IndexedDB

Fecha: 2026-07-10
Estado: Aceptada

## Contexto

Los conductores operan en zonas sin conectividad y necesitan capturar fotos de evidencia. Las fotos deben almacenarse localmente hasta que haya conexion.

## Decision

Almacenamos fotos offline como blobs en una base IndexedDB separada (`nci-lct-photos`), aislada de la cola de comandos (`nci-lct-driver`).

### Diseno

- **Store separado**: evita que blobs pesados degraden la cola de comandos.
- **EXIF stripping client-side**: `stripExifClient()` remueve metadatos GPS antes de persistir.
- **Quota**: max 50 fotos por owner, max 10 MB por foto.
- **TTL**: fotos mayores a 7 dias se purgan automaticamente.
- **Idempotencia**: cada foto tiene un `idempotencyKey` que se verifica server-side via `AttachmentReceipt`.
- **Aislamiento**: todo filtrado por `ownerKey = userId::tenantId::driverId`.

### Lo que NO se almacena en IndexedDB

- Cookies, sesiones o tokens.
- Signed URLs de MinIO.
- Datos de otros usuarios o tenants.

## Alternativas consideradas

1. **Cache API + Service Worker**: mas complejo, SW ya no cachea rutas privadas.
2. **LocalStorage como base64**: limite de 5MB total, inviable para fotos.
3. **SQLite via OPFS**: soporte limitado en Safari/iOS.

## Consecuencias

- IndexedDB agrega ~50MB de storage potencial por usuario.
- La DB de fotos es independiente: errores en una no afectan la otra.
- El sync de fotos es separado del sync de comandos offline.
