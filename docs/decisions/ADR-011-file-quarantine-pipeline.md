# ADR-011: File Quarantine Pipeline con ClamAV

Fecha: 2026-07-10
Estado: Aceptada

## Contexto

Los archivos subidos por conductores (evidencia de entrega) iban directamente al bucket de produccion sin escaneo antivirus ni cuarentena. Un archivo malicioso quedaba descargable inmediatamente.

## Decision

Implementamos un pipeline de cuarentena con ClamAV local:

1. **Quarantine-first**: todo archivo sube a `quarantine/{targetKey}` en MinIO.
2. **Scan**: ClamAV via TCP (INSTREAM protocol) escanea el buffer.
3. **Promote**: archivos CLEAN se copian de cuarentena a produccion y el original se borra.
4. **Reject**: archivos INFECTED se borran y marcan REJECTED.
5. **Fail-closed**: si ClamAV no responde a PING, el archivo queda en QUARANTINE (nunca disponible).

### Modelo de datos

- `FileAttachment`: estados PENDING_UPLOAD → QUARANTINE → PENDING_SCAN → SCANNING → CLEAN → AVAILABLE (o INFECTED → REJECTED).
- `FileScanEvent`: trazabilidad de cada escaneo con verdict, detalle y duracion.
- `AttachmentReceipt`: idempotencia para uploads offline.

### EXIF Stripping

Se remueven marcadores APP1 (Exif/GPS), APP2 (ICC), APP12, APP13 (IPTC) y COM de imagenes JPEG antes de almacenar, tanto server-side (`stripExif`) como client-side (`stripExifClient`).

## Alternativas consideradas

1. **Scan externo via API (VirusTotal, etc.)**: requiere internet, expone datos de clientes.
2. **Scan solo en descarga**: permitiria almacenar archivos maliciosos; mas riesgo.
3. **Sin scan, solo validacion MIME/magic bytes**: insuficiente contra malware real.

## Consecuencias

- Docker Compose requiere servicio `clamav` (imagen ~400MB + firmas ~300MB).
- Primera inicializacion de ClamAV toma 2-5 minutos (descarga de firmas).
- El pipeline agrega latencia al upload (~1-2s por escaneo).
- Downloads filtran solo archivos AVAILABLE — documentos en cuarentena son inaccesibles.
