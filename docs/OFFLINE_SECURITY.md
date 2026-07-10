# OFFLINE SECURITY

Fecha: 2026-07-09
Complemento de [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md) y [THREAT_MODEL.md](THREAT_MODEL.md).

## Principios

1. **La cola local no es autoridad**. Cada comando se revalida en servidor: sesión, membresía, asignación, whitelist de transiciones y máquina de estados.
2. **Aislamiento por owner**: los registros IndexedDB están tageados con `ownerKey = userId::tenantId::driverId`. Ninguna sesión ve datos de otra.
3. **Ninguna credencial en IndexedDB**: nunca se guardan contraseñas, cookies, tokens, signed URLs, objectKeys ni datos administrativos.
4. **Idempotencia con hash del payload**: reejecutar la misma `idempotencyKey` con hash distinto ⇒ rechazo + auditoría.
5. **Cierre auditado**: logout con pendientes exige decisión explícita.

## Datos que SÍ viven en IndexedDB

- `localCommandId`, `idempotencyKey`, `ownerKey`, `tenantSlug`.
- `payload` con `actionType`, `tripId`, `nextStatus` o incidencia.
- Estado local, contador de intentos, códigos de error seguros, timestamps.

## Datos que NO se guardan

- Contraseñas / hashes.
- Cookies / tokens / cabeceras Authorization.
- Signed URLs (ni completas ni parciales).
- `objectKey` de MinIO.
- Información de otros viajes o de otro conductor.
- Blobs de firma o fotografías (fuera de alcance de esta fase; ver "Trabajo futuro").

## Superficie del endpoint `/driver/sync`

- Solo POST. Requiere sesión (`requireTenantRole`) y membresía activa.
- Valida Origin/Host (whitelist `ALLOWED_ORIGINS`).
- Solo acepta `application/json`, `content-length ≤ 512 KB`.
- Rate limit por `(tenant, user, IP)` — 30 req/min.
- Valida el request completo con Zod discriminado.
- Whitelist de acciones y transiciones por rol.
- Devuelve un resultado por comando; nunca 500 sin log estructurado.

## Manejo de conflictos

- `STATE_CONFLICT`: transición inválida para el estado actual → CONFLICT (no reintentable).
- `ASSIGNMENT_CHANGED`: viaje reasignado a otro conductor → REJECTED.
- `RESOURCE_NOT_FOUND`: viaje inexistente / de otro tenant → REJECTED (sin filtración de existencia cruzada).
- `PAYLOAD_TAMPERED`: hash cambió con misma clave → REJECTED + audit event `offline.payload_tampered`.
- Errores transitorios → RETRYABLE con backoff exponencial (5s → 5m).

## Auditoría

Cada acción sincronizada genera un evento en `audit_logs` con `action = offline.trip.transition | offline.trip.incident | offline.payload_tampered`, incluyendo `idempotencyKey`. Los intentos rechazados por Origin/rate-limit se loggean en `logger.warn` (sin secretos).

## Sesión

- Los comandos en vuelo con sesión expirada NO se auto-sincronizan: el sync client detecta `401/403` y marca `RETRYABLE_ERROR` con código `SESSION_EXPIRED`; el usuario debe reautenticarse. La UI muestra el motivo.
- El logout con pendientes usa `LogoutGuard`: sincronizar → cancelar → descartar (con confirmación).

## Riesgos residuales

- Dispositivo compartido físicamente: la cola persiste hasta logout o purga. Sin cifrado at-rest (IndexedDB no cifra). Documentado.
- Un atacante con acceso al dispositivo puede leer los payloads, pero no puede sincronizarlos como otro usuario: el servidor exige la sesión activa del usuario original.
- Sin PostgreSQL disponible, el rate limit `auth.*` "fail-closed" (rechaza intentos); operativo "fail-open". Documentado en `rate-limit.ts`.

## Trabajo futuro

- Fotografías offline como blobs en IndexedDB con límites de tamaño y expiración.
- Firma persistida como PNG binario en MinIO además del data URL para redundancia.
- Escaneo AV real (ClamAV local) para evidencias antes de aprobar POD.
- Rotación proactiva de sesión post-login (fixation defense adicional).
