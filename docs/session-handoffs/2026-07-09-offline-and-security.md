# Handoff — Offline conductor + hardening de seguridad

Fecha: 2026-07-09
Agente: Claude
Commit base: `0242abf`

Ver [docs/HANDOFF_LATEST.md](../HANDOFF_LATEST.md) para el detalle completo.

## Resumen

- Migración `20260709180000_offline_sync_and_rate_limit` (aplicada) con `offline_command_receipts` y `rate_limit_buckets`.
- Cola offline persistida en IndexedDB por owner (`userId::tenantId::driverId`); protocolo compartido con el servidor; canonicalización + hash SHA-256 del payload; backoff exponencial 5s→5m.
- Endpoint `POST /api/t/[tenantSlug]/driver/sync` con Origin/Host, content-type JSON, rate limit persistente, whitelist server-side de transiciones para el rol DRIVER, procesamiento por lote sin abortar.
- Firma real embebida en el POD PDF (`pdfkit.standalone` acepta data URLs PNG válidos); SignaturePad sin trazo demo.
- Headers de seguridad globales, service worker seguro, uploads con magic bytes, signed URLs con TTL 60 s y content-disposition attachment, logger con redacción, códigos de error seguros.
- `nodemailer` 7 → 9.0.3 (parches SMTP command injection y CRLF headers).
- Scripts `pnpm security:{check,test,audit}`.
- Documentación: THREAT_MODEL, OFFLINE_ARCHITECTURE, OFFLINE_SECURITY, SECURITY_HARDENING, SECURITY_CHECKLIST, INCIDENT_RESPONSE, ADR-007, ADR-008; security.md reescrito.
- 21/21 unit tests; 9/9 E2E offline (aislado); security:check 10/10; typecheck y lint limpios.
