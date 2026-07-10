# ADR-007: Modelo de comandos offline con idempotencia persistente en servidor

Fecha: 2026-07-09
Estado: Aceptada

## Contexto

El conductor opera desde una PWA en dispositivo móvil con conectividad intermitente. Necesitamos permitir que registre transiciones de estado e incidencias sin conexión, y garantizar que al reconectarse:

- Ninguna acción se pierda.
- Ninguna acción se duplique.
- Ninguna acción se procese fuera de la máquina de estados válida.
- Ninguna acción proveniente de un dispositivo comprometido pueda escalar privilegios o afectar a otro tenant.

## Decisiones

1. **Cola en IndexedDB por owner** (`userId::tenantId::driverId`) usando `useSyncExternalStore`. Un solo object store `commands`. No usamos librería (idb-keyval, dexie) — el volumen es bajo y la API nativa cubre el caso.
2. **Whitelist estricta de acciones offline** en `src/lib/offline/protocol.ts`:
   - `trip.transition` con `nextStatus ∈ DRIVER_ALLOWED_TRANSITIONS` (10 estados del conductor).
   - `trip.incident` con `category`, `internalDescription`, `customerMessage?`.
   - Cualquier otra acción (asignaciones, aprobaciones, cierre administrativo, plataforma) queda excluida.
3. **Endpoint dedicado** `POST /api/t/[tenantSlug]/driver/sync`:
   - Requiere sesión válida y rol autorizado (revalidado en cada request).
   - Origin/Host validados con whitelist (`ALLOWED_ORIGINS`).
   - Content-type JSON, `content-length ≤ 512 KB`, 25 comandos máximo por lote.
   - Rate limit persistente 30/min por `(tenant, user, IP)`.
   - Zod discriminado. Rechazos NO abortan el lote.
4. **Idempotencia persistente** en tabla `offline_command_receipts` con unicidad `(tenant_id, user_id, idempotency_key)`:
   - `payload_hash` (SHA-256 sobre payload canonicalizado por orden alfabético de claves).
   - Repetir la misma clave con hash idéntico ⇒ `DUPLICATE`.
   - Repetir con hash distinto ⇒ `PAYLOAD_TAMPERED` + `audit_logs`.
   - TTL 30 días; cleanup manual.
5. **Máquina de estados server-side reutilizada**: `canTransition`, `nextStatuses`. El servidor sigue siendo la autoridad; el cliente solo propone.
6. **Backoff exponencial con jitter** en cliente: 5s → 15s → 45s → 2m → 5m. Sin loops agresivos.
7. **Logout con pendientes**: `LogoutGuard` intercepta el submit del form de salir y exige decisión explícita (sincronizar / cancelar / descartar).

## Alternativas descartadas

- **Reusar server actions existentes desde cliente offline con reintento**: no permite idempotencia server-side, no controla lotes, no distingue código de error retryable vs permanente. Rechazado.
- **Librería de sync (RxDB, dexie-observable)**: complejidad y superficie de ataque desproporcionadas al volumen (≤ 25 comandos/min por conductor). Rechazado.
- **Push desde servidor** para invalidar: fuera de alcance de esta fase (requiere WebSockets/SSE).

## Consecuencias

- Nueva migración `20260709180000_offline_sync_and_rate_limit` con dos tablas.
- Nueva dependencia interna en `offline` y `server/offline-sync`.
- Los E2E existentes siguen funcionando: el botón online-first hace enqueue + sync + `router.refresh()`, replicando el flujo previo cuando hay red.
- La cola es aislada por owner; una sesión no ve datos de otra.
- Riesgo residual documentado: dispositivo compartido físicamente (sin cifrado at-rest en IndexedDB).
