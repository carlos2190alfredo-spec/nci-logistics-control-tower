# OFFLINE ARCHITECTURE — Conductor PWA

Fecha: 2026-07-09
Referencia: ADR-007

## Modelo

El conductor puede continuar operando sin conexión. Las acciones se persisten en IndexedDB (dispositivo) y se sincronizan al servidor de forma idempotente cuando hay red. El servidor conserva la autoridad completa: valida sesión, membresía, asignación y máquina de estados en cada comando.

## Componentes

### Cliente

- `src/lib/offline/db.ts` — wrapper mínimo sobre IndexedDB (`nci-lct-driver`), un solo object store `commands` con índices por `(ownerKey, sequence)` y `(ownerKey, status)`.
- `src/lib/offline/queue.ts` — `enqueueCommand`, `listOwnerCommands`, `applyServerResult`, `markLocalError`, `safeCleanupOnLogout`, `forcePurgeOwner`, `periodicCleanup`. Backoff exponencial con jitter: 5s → 15s → 45s → 2m → 5m.
- `src/lib/offline/protocol.ts` — contrato compartido con el servidor (schemaVersion, comandos permitidos, whitelist de transiciones para el rol DRIVER, canonicalización determinista del payload).
- `src/lib/offline/sync-client.ts` — envía lotes al endpoint, actualiza el estado local, distingue red/sesión/rate-limit.
- `src/lib/offline/store.ts` + `hooks.ts` — store externo (`useSyncExternalStore`) aislado por owner (`userId::tenantId::driverId`).
- `src/components/offline/*` — `OfflineProvider`, `SyncStatus`, `PendingActionsPanel`, `OfflineTransitionButton`, `OfflineIncidentFormClient`, `LogoutGuard`.

### Servidor

- `POST /api/t/[tenantSlug]/driver/sync` — endpoint autenticado (rol `DRIVER`, `TENANT_OWNER` o `DISPATCHER`), con validación de Origin/Host, content-type JSON, `content-length ≤ 512 KB`, hasta 25 comandos por lote, rate limit 30 req/min por `(tenant, user, IP)`.
- `src/lib/server/offline-sync.ts` — procesa por lote:
  - Consulta previa: si existe `receipt(tenant, user, idempotencyKey)`, compara `payloadHash`; si no coincide, responde `PAYLOAD_TAMPERED` y lo audita.
  - Procesa por acción (`trip.transition`, `trip.incident`) reutilizando la máquina de estados existente y `assertTenantEntityAccess`. Persiste el recibo en la misma transacción que la mutación real.
  - Nunca aborta el lote por un solo error; devuelve `results[]` alineado por `idempotencyKey`.
- `src/lib/server/rate-limit.ts` — `PostgresRateLimitProvider` con tabla `rate_limit_buckets`; contrato `RateLimitProvider` para intercambio futuro (Redis).

### Base de datos

Migración `20260709180000_offline_sync_and_rate_limit`:
- `offline_command_receipts`: `id, tenant_id, user_id, driver_id, trip_id, idempotency_key, action_type, payload_hash, status, result_entity_id, error_code, client_queued_at, processed_at, expires_at`. Único `(tenant_id, user_id, idempotency_key)`. TTL 30 días.
- `rate_limit_buckets`: `(scope, key)` único con `count`, `window_end`.

## Estados

| Estado local | Significado |
|---|---|
| `PENDING` | Encolado, aún no intentado |
| `SYNCING` | En vuelo |
| `SYNCED` | Confirmado por servidor (ACCEPTED o DUPLICATE) |
| `RETRYABLE_ERROR` | Reintentar según `nextRetryAt` |
| `CONFLICT` | Estado incompatible (p. ej. transición inválida) |
| `REJECTED` | Rechazo permanente (payload alterado, asignación cambiada) |
| `DISCARDED` | Descartado explícitamente por el usuario |

Estados del servidor (`OfflineCommandStatus`): `ACCEPTED`, `DUPLICATE`, `CONFLICT`, `REJECTED`, `FAILED`.

## Idempotencia

- `idempotencyKey` es un UUID generado en el cliente al encolar.
- El payload se canonicaliza (ordena claves) y se hashea con SHA-256.
- Reejecutar el mismo comando (misma clave + mismo hash) responde `DUPLICATE` con `serverEventId` del original.
- Reejecutar con hash diferente → `REJECTED / PAYLOAD_TAMPERED` + auditoría.

## Orden

- Los comandos del mismo lote se ordenan por `localSequence` antes de procesar.
- La máquina de estados del dominio rechaza transiciones fuera de secuencia (`STATE_CONFLICT`).
- Si el viaje fue reasignado (`trip.driverId !== ctx.driverId`) → `ASSIGNMENT_CHANGED`.
- Si fue cancelado o cerrado → `STATE_CONFLICT`.

## UI

- `SyncStatus` — barra con estado de conectividad y contadores (pendientes, reintentando, conflictos).
- `PendingActionsPanel` — lista por grupo con la razón en lenguaje humano, descarte manual para conflictos/rechazados.
- `OfflineTransitionButton` — encola + sincroniza + `router.refresh()` si aceptado.
- `LogoutGuard` — si hay pendientes, exige decisión explícita (sincronizar / cancelar / salir descartando).

## Ciclo de vida

1. Enqueue: `owner + payload → PENDING`.
2. Reintento periódico (45 s) + al volver `online`.
3. Cleanup: `SYNCED` > 24 h se purga cada 5 min.
4. Logout limpio → purga completa; logout con pendientes → guarda hasta decisión del usuario.

## Riesgos y decisiones

- **Dispositivo compartido**: la cola vive en IndexedDB; en logout, el `LogoutGuard` obliga a decidir. Documentado como riesgo residual.
- **Signed URLs no se cachean** en el service worker; el TTL fue reducido a 60 s.
- **Sin escaneo AV** — los uploads validan magic bytes; se define abstracción para adopción futura de ClamAV local.
