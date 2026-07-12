# OPERABILITY AUDIT — NCI Logistics Control Tower

Fecha: 2026-07-12
Commit base: `0d3ba3f`
Autor: Claude Opus 4.6 (equipo multidisciplinario senior)

## Resumen ejecutivo

El sistema es funcionalmente solido pero operativamente opaco. No existe forma programatica de saber si un servicio esta caido, si un backup fallo, si hay archivos acumulados sin escanear o si alguien esta abusando el login. Un operador hoy necesita ejecutar scripts manuales y leer salida de consola para detectar problemas.

---

## 1. Que se puede monitorear actualmente

| Aspecto | Como | Limitacion |
|---|---|---|
| PostgreSQL vivo | `docker compose ps`, `pnpm files:health` | Manual, no automatico, no persiste resultado |
| MinIO vivo | `pnpm files:health` | Manual, no persiste |
| ClamAV vivo | `pnpm files:health` | Manual, no persiste |
| Archivos por estado | `pnpm files:health` (imprime conteo) | Manual, salida a consola |
| EICAR test | `pnpm files:test:eicar` | Manual, no persiste resultado |
| Backups | `pnpm backup:drill` genera JSON | Manual, no persiste en DB |
| Migraciones | `pnpm prisma migrate status` | Manual |
| Tests | `pnpm test`, `pnpm test:e2e` | Manual, no persiste |
| Seguridad estatica | `pnpm security:check` | Manual, no persiste |
| Audit log | Tabla `audit_logs` en PostgreSQL | Existe pero no tiene requestId, no tiene IP/UA |
| Login failures | `users.failedLoginAttempts` | Contador por usuario, no historico ni alerta |
| Rate limits | `rate_limit_buckets` en DB | Existe pero no hay alerta cuando se activan frecuentemente |

## 2. Que NO se puede monitorear

| Area | Prioridad | Impacto |
|---|---|---|
| Request IDs | P0 | Imposible correlacionar un error del usuario con un log del servidor |
| Health de servicios (programatico) | P0 | No hay endpoint para saber si el sistema funciona |
| Errores 500 en produccion | P0 | Se muestran al usuario pero no se registran con contexto |
| Logs estructurados con contexto de request | P1 | El logger existe pero no incluye requestId, tenantId, userId, route |
| Backups exitosos/fallidos | P1 | No hay registro persistente ni alerta |
| ClamAV caido | P0 | Solo se detecta al intentar escanear un archivo |
| MinIO caido | P0 | Solo se detecta al intentar leer/escribir |
| PostgreSQL caido | P0 | Solo se detecta al intentar consultar |
| Acumulacion de PENDING_SCAN | P1 | No hay alerta si documentos se acumulan sin escanear |
| Archivos infectados detectados | P0 | Se registran en DB pero no generan alerta |
| Abuso de login/MFA | P1 | Rate limit existe pero no alerta a un administrador |
| PWA offline sync status | P1 | El servidor no recibe telemetria del cliente |
| PhotoSyncEngine failures | P1 | Solo visibles en consola del navegador |
| Jobs no auditados | P1 | backup, cleanup, eicar-test no persisten resultado |
| Metricas operativas | P1 | No hay conteos de sesiones, viajes activos, errores |
| Panel de estado | P1 | No existe vista para que un admin vea salud del sistema |
| Alertas | P1 | No existe motor de alertas |

## 3. Donde existen logs

| Ubicacion | Contenido | Formato |
|---|---|---|
| `src/lib/server/logger.ts` | Trazas tecnicas (debug/info/warn/error) | JSON line a stdout/stderr |
| `src/lib/server/audit.ts` | Eventos de negocio (login, tenants, viajes, etc.) | Tabla `audit_logs` en DB |
| Scripts (`console.log`) | Backup drill, cleanup, health, eicar | Texto plano a stdout |
| Next.js | Errores de renderizado | Consola de proceso |

## 4. Logs inseguros o insuficientes

| Hallazgo | Prioridad | Detalle |
|---|---|---|
| Logger no incluye requestId | P0 | Imposible correlacionar |
| Logger no incluye tenantId/userId/role | P1 | Falta contexto de negocio |
| Logger no incluye route/method/statusCode | P1 | Falta contexto HTTP |
| Logger no incluye durationMs | P1 | Sin metricas de latencia |
| Logger no tiene niveles security/audit/job/metric | P1 | Mezcla todo en 4 niveles |
| Audit log no incluye requestId | P1 | Sin correlacion con trazas |
| Audit log no incluye IP ni User-Agent | P1 | Ya capturado en sesion pero no en audit |
| SENSITIVE_KEYS incompleta | P1 | Falta: otp, mfa, recoveryCode, backupEncryptionKey, databaseUrl, minioSecret |
| Scripts usan console.log directo | P1 | Sin redaccion, sin formato, no persiste |

## 5. Errores no trazados

| Escenario | Prioridad |
|---|---|
| Error 500 en server action | P0 — solo se ve en consola Next.js, no queda en logs con requestId |
| Error de Prisma en consulta | P0 — puede exponer schema o query details |
| Error de S3/MinIO en upload/download | P1 — catch generico, no registra endpoint ni objectKey seguro |
| Error de ClamAV timeout | P1 — fails closed pero no alerta |
| POD PDF generation failure | P1 — try/catch pero no alerta |
| Password reset email send failure | P1 — log warn pero no alerta |

## 6. Jobs sin auditoria

| Job | Se ejecuta via | Resultado persistido | Alerta si falla |
|---|---|---|---|
| `backup:all` | CLI manual | No | No |
| `backup:drill` | CLI manual | JSON en filesystem | No |
| `files:health` | CLI manual | stdout | No |
| `files:test:eicar` | CLI manual | stdout | No |
| `files:cleanup` | CLI manual | stdout | No |
| `files:migrate-legacy` | CLI manual | stdout | No |
| `pwa:check` (no existe) | N/A | N/A | N/A |
| `security:check` | CLI manual | stdout | No |
| ClamAV scan | Automatico en upload | DB (file_scan_events) | No |
| POD PDF generation | Automatico en approve | Filesystem | No |
| Photo sync processing | Automatico via attachment endpoint | DB (file_attachments) | No |

## 7. Servicios sin health check

| Servicio | Docker healthcheck | App-level check | Endpoint |
|---|---|---|---|
| PostgreSQL | Si (pg_isready) | files:health script | No |
| MinIO | Si (mc ready) | files:health script | No |
| ClamAV | Si (PING/PONG) | files:health script | No |
| Mailpit | Si (/mailpit readyz) | No | No |
| Next.js app | No | No | No |
| Prisma/DB connection | No | No | No |
| Backup system | No | No | No |
| PWA/SW | No | No | No |

## 8. Metricas faltantes

### Sistema
- Uptime de la app
- Build commit y version
- Node version y environment

### Base de datos
- Latencia de consultas
- Conteo de tenants, usuarios, viajes activos/cerrados
- Sesiones activas y verificadas MFA
- Audit logs total

### Operacion
- Solicitudes pendientes por estado
- Viajes por estado
- Evidencias pendientes
- Documentos por estado de scan
- Cuarentena acumulada

### Seguridad
- Login failures (historico, no solo contador)
- MFA failures
- Password reset requests
- Rate limit activations
- Intentos cross-tenant
- Archivos infectados
- Uploads rechazados

### Offline/PWA
- Acciones offline pendientes
- Fotos pendientes
- Sync fallidos
- Conflictos
- Ultima sincronizacion

### Backups
- Ultimo backup exitoso
- Ultimo restore drill
- Tamano y duracion
- Edad del backup

## 9. Alertas faltantes

No existe ningun mecanismo de alerta. Todos los eventos criticos pasan inadvertidos a menos que un operador ejecute scripts manualmente.

### P0 — Bloqueante operativo
- PostgreSQL caido
- MinIO caido
- ClamAV caido
- Backup fallido
- Restore drill fallido
- Error critico en auth/MFA
- Archivo infectado detectado
- Muchos errores 500
- Cross-tenant attempt

### P1 — Antes de piloto
- Documentos PENDING_SCAN acumulados
- Photo sync con muchos fallos
- Offline queue con conflictos acumulados
- Backups atrasados
- Storage elevado
- PWA service worker obsoleto

## 10-16. Deteccion de fallas

| Evento | Deteccion actual | Prioridad |
|---|---|---|
| PostgreSQL caido | Ninguna hasta que falla una consulta | P0 |
| MinIO caido | Ninguna hasta que falla un upload/download | P0 |
| ClamAV caido | Ninguna hasta que falla un scan (fail-closed) | P0 |
| Backup fallido | Ningun — el operador debe ejecutar y leer salida | P1 |
| PWA/offline sync fallido | Ninguna — solo visible en consola del navegador | P1 |
| Abuso login/MFA | Rate limit bloquea pero no alerta | P1 |
| PhotoSyncEngine fallido | Ninguna — solo visible en consola del navegador | P1 |

## 17. Que necesita un administrador para operar

1. **Dashboard de salud** que muestre estado de servicios en tiempo real
2. **Alertas** que notifiquen cuando algo falla
3. **Request IDs** para correlacionar errores reportados por usuarios
4. **Logs estructurados** con contexto suficiente para diagnosticar
5. **Metricas basicas** de volumen y estado del sistema
6. **Monitoreo de backups** con edad y resultado
7. **Monitoreo de ClamAV** con PENDING_SCAN y INFECTED
8. **Telemetria PWA** para saber si conductores tienen problemas
9. **Historial de jobs** para saber que se ejecuto y cuando

## 18. Que debe quedar antes de un piloto

- Request ID en cada solicitud y respuesta
- Logger estructurado con redaccion completa
- Health/readiness endpoints
- Panel de estado del sistema
- Alertas basicas via Mailpit
- Monitoreo de backups, ClamAV, MinIO, PostgreSQL
- Telemetria PWA minima
- Job observability persistida
- Metricas operativas basicas

## 19. Que puede esperar hasta produccion

- Observabilidad externa (Sentry, Datadog, Grafana)
- Prometheus metrics endpoint
- Distributed tracing (OpenTelemetry)
- Log aggregation y busqueda (ELK, Loki)
- Alertas por SMS/PagerDuty
- Metricas de latencia P50/P95/P99
- SLO/SLA monitoring
- APM (Application Performance Monitoring)
- Canary deployments con rollback automatico
- Runbook automation

---

## Clasificacion de hallazgos

| ID | Hallazgo | Prioridad |
|---|---|---|
| OBS-001 | Sin request IDs | P0 |
| OBS-002 | Sin health check endpoints | P0 |
| OBS-003 | Errores 500 sin traza ni requestId | P0 |
| OBS-004 | ClamAV/MinIO/PostgreSQL caida no detectada | P0 |
| OBS-005 | Logger sin contexto de request (tenant, user, route) | P1 |
| OBS-006 | Sensitive keys incompletas en logger | P1 |
| OBS-007 | Sin motor de alertas | P1 |
| OBS-008 | Sin panel de estado del sistema | P1 |
| OBS-009 | Sin metricas operativas | P1 |
| OBS-010 | Sin telemetria PWA | P1 |
| OBS-011 | Jobs no auditados (backup, cleanup, eicar, etc.) | P1 |
| OBS-012 | Sin monitoreo de backups persistido | P1 |
| OBS-013 | Sin monitoreo de archivos PENDING_SCAN/INFECTED | P1 |
| OBS-014 | Sin runbook de incidentes operativos | P1 |
| OBS-015 | Audit log sin requestId ni IP/UA | P1 |
| OBS-016 | Scripts usan console.log sin redaccion | P2 |
| OBS-017 | Error page no muestra requestId | P2 |
| OBS-018 | Sin metricas de latencia | P2 |
| OBS-019 | Sin observabilidad externa (Sentry/Datadog) | P3 |
| OBS-020 | Sin distributed tracing | P3 |
| ACEPTADO | Logger basico con redaccion ya existe | — |
| ACEPTADO | Audit log persiste eventos de negocio | — |
| ACEPTADO | Docker healthchecks existen para los 4 servicios | — |
| ACEPTADO | Rate limiting persiste en DB | — |
| ACEPTADO | ClamAV fail-closed protege contra AV offline | — |

---

## Plan de remediacion

| Fase | Alcance | Hallazgos cubiertos |
|---|---|---|
| 1. Request ID + Logger | requestId generation, propagacion, logger mejorado | OBS-001, OBS-005, OBS-006, OBS-015 |
| 2. Health/Readiness/Metrics | Endpoints internos, job observability | OBS-002, OBS-004, OBS-009, OBS-011, OBS-012, OBS-013 |
| 3. Alertas + Dashboard | Motor local, panel de sistema | OBS-003, OBS-007, OBS-008, OBS-017 |
| 4. PWA Telemetry + Scripts | Endpoint telemetria, scripts operativos | OBS-010, OBS-014 |
| 5. Tests + Docs | Unit, E2E, security checks, documentacion | Verificacion de todo lo anterior |
