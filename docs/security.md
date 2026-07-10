# Security

Controles activos y referencia rápida. Detalle en:
- [THREAT_MODEL.md](THREAT_MODEL.md) — amenazas y controles.
- [SECURITY_HARDENING.md](SECURITY_HARDENING.md) — hardening aplicado en la fase actual.
- [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) — checklist por etapa (local → piloto → nube → producción).
- [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) — plan de respuesta a incidentes.
- [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md) + [OFFLINE_SECURITY.md](OFFLINE_SECURITY.md) — sincronización idempotente y aislamiento offline.
- ADRs: [ADR-007](decisions/ADR-007-offline-command-and-idempotency-model.md), [ADR-008](decisions/ADR-008-security-baseline-and-rate-limiting.md).

## Controles activos

### Autenticación y sesiones

- Argon2id para contraseñas.
- Sesión opaca (token aleatorio + hash SHA-256 en `sessions`).
- Cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción, expiración 7 días.
- Delay constante en fallo de login (250 ms) + rate limit persistente 10/min por correo.

### Autorización

- Guards server-side por plataforma, tenant, cliente y conductor.
- Whitelist de acciones offline por rol.
- Ninguna autorización se deriva de `tenant_id`/`role` enviados por el cliente.

### Web

- CSP con `frame-ancestors 'none'`, `object-src 'none'`, sin `unsafe-eval` en producción.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` restrictivo, `COOP`, `CORP`.
- Route handlers mutables validan Origin/Host y `content-type`.
- Server Actions con protección de Origin nativa de Next.js.

### Uploads y storage

- Magic bytes verificados; extensión coherente con MIME; 32 B – 5 MB.
- `Content-Disposition: attachment` en subida y descarga.
- MinIO privado por defecto; signed URLs con TTL 60 s; `objectKey` nunca proviene del cliente.
- Cliente pide `documentId`, servidor resuelve la ruta autorizada.

### Sincronización offline

- Endpoint `/api/t/[tenantSlug]/driver/sync` con Origin check, rate limit, lote ≤ 25 comandos, ≤ 512 KB.
- Idempotencia persistente en `offline_command_receipts` con `(tenant_id, user_id, idempotency_key)` único + `payload_hash`.
- Manipulación de payload con misma clave ⇒ `PAYLOAD_TAMPERED` + auditoría.
- Transiciones limitadas a la whitelist del rol DRIVER; máquina de estados server-side reutilizada.

### Logs y auditoría

- `logger` con redacción centralizada de secretos.
- `audit_logs` inmutable desde UI; captura login, tenants, solicitudes, viajes, incidencias, evidencias, POD, descargas sensibles, comandos offline aceptados y `payload_tampered`.

## Herramientas

```bash
pnpm security:check    # verificaciones estáticas locales
pnpm security:test     # suite Playwright de idempotencia + Origin + IDOR
pnpm security:audit    # pnpm audit --prod (no-fail; documenta)
```

## Pendientes documentados

- Recuperación de contraseña con tokens hasheados de un solo uso.
- Rotación de sesión post-login.
- Fotografías offline con blobs limitados.
- Escaneo AV local (ClamAV) para uploads.
- Actualización de dependencias transitivas cuando parcheen upstream.
