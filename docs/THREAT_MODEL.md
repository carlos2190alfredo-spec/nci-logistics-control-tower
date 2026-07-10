# THREAT MODEL — NCI Logistics Control Tower

Fecha: 2026-07-09
Alcance: prototipo local con flujo operacional completo, aislamiento multitenant, PWA offline del conductor y prueba de entrega firmada.
Metodología: STRIDE adaptado + análisis por flujo. Escala impacto/probabilidad: bajo/medio/alto.

## Activos protegidos

| Activo | Ubicación | Criticidad |
|---|---|---|
| Sesiones de usuario | Cookie httpOnly `nci_lct_session` + tabla `sessions` (hash SHA-256 del token opaco) | Alta |
| Contraseñas | `users.passwordHash` con Argon2id | Alta |
| Datos operativos por tenant | Prisma: trips, requests, incidents, drivers, vehicles, customers | Alta |
| Documentos de cliente | MinIO bucket privado + `documents.objectKey`, POD PDF | Alta |
| Firma del receptor | `proofs_of_delivery.signatureSvg` (data URL) + PNG en MinIO (nueva fase) | Alta |
| Cola offline del conductor | IndexedDB en dispositivo del conductor | Media |
| Recibos de idempotencia | `offline_command_receipts` (nueva fase) | Media |
| Audit log | `audit_logs` (append-only lógico) | Alta |

## Actores y confianza

| Actor | Rol | Nivel de confianza |
|---|---|---|
| Plataforma NCI | `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT` | Alto (auditado) |
| Tenant | `TENANT_OWNER`, `TENANT_ADMIN`, `OPERATIONS_MANAGER`, `DISPATCHER` | Alto dentro del tenant |
| Conductor | `DRIVER` (rol tenant) + `drivers.userId` para atarlo al viaje | Medio (dispositivo compartido posible) |
| Cliente final | `CUSTOMER_ADMIN`, `CUSTOMER_VIEWER` (rol customer) | Medio |
| Atacante externo | Sin sesión | Nulo |
| Atacante interno (sesión válida en otro tenant/cliente/conductor) | Autenticado | Bajo |

## Fronteras de confianza

1. Cliente HTTP → Server actions/route handlers (Next.js).
2. Server → PostgreSQL (Prisma, credenciales locales).
3. Server → MinIO (S3 privado, credenciales locales).
4. Server → SMTP local (Mailpit).
5. Dispositivo del conductor → IndexedDB (no confiable, dispositivo posiblemente compartido).
6. Service Worker → HTTP cache.

## Superficie de ataque

- Rutas públicas: `/`, `/login`, endpoints estáticos, `/manifest.webmanifest`, `/sw.js`.
- Rutas autenticadas: `/platform`, `/t/[tenantSlug]/*`, `/api/t/[tenantSlug]/documents/[id]`, `/api/t/[tenantSlug]/proof/[tripId]`, `/api/t/[tenantSlug]/driver/sync` (nueva).
- Server actions expuestas: login, logout, create tenant, start support mode, create request, confirm request, assign trip, transition trip, report incident, submit proof, approve proof, reject proof.
- IndexedDB: cola offline, blobs de evidencia, snapshots del viaje asignado.

## Amenazas y controles (STRIDE)

### S — Spoofing

| Amenaza | Impacto | Prob. | Controles actuales | Nuevos controles | Residual |
|---|---|---|---|---|---|
| Suplantación de conductor por manipulación de `driver_id`/`user_id` en cliente | Alto | Media | Guardas server (`requireTenantRole DRIVER`, `driver.userId === user.id`) | Sync endpoint revalida `driver.userId` por lote | Bajo |
| Reutilización de sesión robada (dispositivo compartido) | Alto | Media | Cookie httpOnly, SameSite=Lax, expiración 7d, revocación en logout | Docs advierten no compartir dispositivo; cola offline se limpia en logout con pendientes visibles | Medio (dispositivo físico) |
| Enumeración de usuarios en login | Bajo | Alta | Mensaje genérico "Credenciales invalidas" | Delay artificial + rate limit por IP+correo | Bajo |
| Fijación de sesión previa a login | Medio | Baja | Cookie se genera en login (no pre-existente) | — | Bajo |

### T — Tampering

| Amenaza | Impacto | Prob. | Controles | Nuevos | Residual |
|---|---|---|---|---|---|
| Manipulación de cola offline (editar IndexedDB) | Alto | Media | Autorización server-side, `driver.userId === session.user.id`, verificación de asignación por viaje | Recibos por `tenant_id+user_id+idempotency_key`, hash del payload, rechazo si hash cambia con misma clave | Bajo |
| Replay de acción offline | Medio | Alta | — | Idempotencia persistente en `offline_command_receipts` | Bajo |
| Payload alterado con misma idempotencyKey | Medio | Media | — | Guardar `payload_hash` (sha256 normalizado), rechazar si difiere | Bajo |
| Rol/tenant enviado por formulario | Alto | Baja | Todos los guards resuelven contra sesión y ruta | — | Bajo |
| Manipulación de `objectKey` en URL | Alto | Media | `/api/t/*/documents/[id]` valida documento por id contra tenant y customer | — | Bajo |
| Path traversal en nombre de archivo | Alto | Baja | `safeFilename()` normaliza + `objectKey` generado por servidor | Validación por magic bytes agregada | Bajo |
| Modificación de audit_logs | Alto | Baja | Sin endpoint de escritura desde UI | — | Bajo |

### R — Repudiation

| Amenaza | Impacto | Prob. | Controles | Nuevos | Residual |
|---|---|---|---|---|---|
| Conductor niega acción offline | Medio | Media | `audit_logs` de transiciones; eventos con `actorId` | Cada comando offline registra `idempotency_key` y `queued_at`/`processed_at` en receipt | Bajo |
| Manipulación de firma | Alto | Baja | Firma persistida como data URL en DB | PNG binario en MinIO privado + validación de magic bytes; POD embebe imagen real | Bajo |

### I — Information Disclosure

| Amenaza | Impacto | Prob. | Controles | Nuevos | Residual |
|---|---|---|---|---|---|
| Cross-tenant en documentos/POD | Alto | Media | Guards `requireCustomerMembership`, `resolveActiveTenant`, filtros `where tenantId` | Pruebas negativas E2E-FLOW-002/003, tests nuevos IDOR | Bajo |
| Signed URL de MinIO reutilizada | Medio | Media | TTL 300s (default), URLs generadas por servidor | Reducir TTL a 60s para descargas privadas, no cachear en SW | Bajo |
| Datos de otro tenant filtrados en errores | Medio | Baja | Redirects a `/login` en falta de acceso, sin diferenciar `404` de `403` en documentos | Códigos de error seguros (`RESOURCE_NOT_FOUND` genérico) | Bajo |
| Datos sensibles en logs/console | Bajo | Media | — | Módulo `logger` con redacción; sin firma/token/objectKey en logs | Bajo |
| IndexedDB en dispositivo compartido | Medio | Alta | — | Advertencia en logout con pendientes; limpieza en logout limpio; sesión indexada por `userId` | Medio (físico) |
| Enumeración vía diferencia de tiempos | Bajo | Media | — | Delay constante en login fallido | Bajo |

### D — Denial of Service

| Amenaza | Impacto | Prob. | Controles | Nuevos | Residual |
|---|---|---|---|---|---|
| Fuerza bruta a login | Medio | Media | `failedLoginAttempts` incrementa | Rate limit persistente (tabla `rate_limit_buckets`) | Bajo |
| Abuso de `/driver/sync` con lotes gigantes | Medio | Media | — | Límite de 25 comandos por request, tamaño total 512 KB, límite por IP+usuario | Bajo |
| Abuso de generación POD (regenera PDF cada aprobación) | Bajo | Baja | Solo se genera al aprobar; ya está persistido | Rate limit en `approveProofAction` | Bajo |
| Upload de archivos gigantes | Medio | Media | 5 MB por archivo | Se mantiene, + validación de magic bytes previene tipos ejecutables disfrazados | Bajo |
| Consumo de storage local por IndexedDB | Bajo | Media | — | Límite de blobs 5 MB c/u, total 25 MB por conductor, expiración 7 días | Bajo |

### E — Elevation of Privilege

| Amenaza | Impacto | Prob. | Controles | Nuevos | Residual |
|---|---|---|---|---|---|
| Escalada a `PLATFORM_SUPER_ADMIN` | Crítico | Baja | `user.platformRole` en DB, verificado server-side | Sin endpoint de escritura de `platformRole` desde UI | Bajo |
| Escalada de conductor a operaciones | Alto | Baja | Guards por rol; sync endpoint acepta solo transiciones del rol DRIVER | Whitelist de `actionType` por rol en `sync.ts` | Bajo |
| Abuso del modo soporte | Medio | Media | Motivo obligatorio (≥8 chars), auditoría | Banner permanente durante la sesión ya existe | Bajo |

## Vectores web comunes

- **CSRF**: Server Actions de Next.js validan Origin automáticamente. Los route handlers mutables (`/driver/sync`) validan `Origin` y `Host` explícitamente.
- **XSS**: React escapa por defecto; sin `dangerouslySetInnerHTML`. Contenido de usuario (incidencias, notas) se muestra como texto.
- **SQL injection**: Prisma parametriza; sin `queryRawUnsafe`. Verificado por `security:check`.
- **CSV injection**: no hay exports CSV actualmente. Si se agregan, neutralizar `= + - @` iniciales.
- **Open redirect**: `redirect()` solo a rutas internas literales.
- **Clickjacking**: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`.

## Riesgos residuales

1. **Dispositivo compartido del conductor** — Riesgo físico. Mitigado con advertencia en logout con pendientes y cierre visible de sesión.
2. **Vulnerabilidades transitivas** de `fast-xml-parser` (AWS SDK), `postcss` (Next), `effect` (Prisma) — sin ruta directa de explotación en nuestra superficie; se actualizarán cuando lo hagan las dependencias raíz.
3. **Sin escaneo AV real** — Los uploads no se analizan por malware. Se define abstracción `PENDING_SCAN → CLEAN/REJECTED` para adopción futura con ClamAV local.
4. **Recuperación de contraseña** — Aún no implementada (fase futura).
5. **HTTPS local no aplicable** — HSTS y Secure cookies solo en producción con TLS terminada.

## Priorización (esta fase)

| Prioridad | Control | Estado |
|---|---|---|
| P1 | Idempotencia persistente offline | Implementado |
| P1 | Firma embebida en POD | Implementado |
| P1 | Whitelist de acciones offline por rol | Implementado |
| P1 | Origin/Host check en `/driver/sync` | Implementado |
| P1 | Headers de seguridad globales | Implementado |
| P1 | Rate limit persistente en login y sync | Implementado |
| P2 | Magic bytes en uploads | Implementado |
| P2 | Redacción de logs | Implementado |
| P2 | Service worker: no cachear API autenticada ni MinIO | Implementado |
| P3 | Update nodemailer 7 → 7.0.11+ patched | Nota: la versión instalada 7.0.11 es la última publicada; no hay parche aún |
| P3 | Recuperación de contraseña con Mailpit | Diferido |
