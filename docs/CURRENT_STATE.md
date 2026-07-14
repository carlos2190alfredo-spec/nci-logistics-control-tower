# CURRENT STATE

Fecha: 2026-07-13

## Fase actual

Operaciones IA: estimacion de ruta (disabled/simulated/Google Routes API), horarios de conductores, motor de recomendacion de conductores por reglas, dashboard de insights operativos. Todo sin IA externa, sin WhatsApp/GPS/Waze real.

## Implementado (fase actual — Observabilidad)

- **Request ID**: Middleware de Next.js genera/valida UUID por request, propaga en headers X-Request-ID.
- **Logger estructurado**: 8 niveles (debug, info, warn, error, security, audit, job, metric). Salida JSON con contexto. 30+ claves sensibles redactadas automaticamente.
- **Error handling**: `AppError` con categorias y codigos seguros. `error.tsx` muestra digest sin detalles internos.
- **Health checks**: PostgreSQL (raw SQL), Prisma, MinIO (HTTP), ClamAV (TCP PING/PONG), Mailpit (HTTP). Timeout 5s por check.
- **Metricas**: 19 queries paralelas (tenants, usuarios, sesiones, MFA, viajes, audits, archivos, offline, backups, alertas).
- **Alertas**: Deduplicacion con `dedupeKey` unico, cooldown P0/P1/P2, notificacion via Mailpit/SMTP.
- **Job runner**: `runObservedJob()` persiste inicio/fin/duracion/estado en tabla `JobRun`.
- **PWA telemetry**: Endpoint para conductores con allowlist estricta (9 keys), rejeccion de base64/data URLs, rate limit 10/min.
- **Dashboard**: `/platform/system-status` — 14 secciones, solo PLATFORM_SUPER_ADMIN/SUPPORT con MFA.
- **API endpoints**: health (publico), liveness (publico), readiness (autenticado), metrics (autenticado).
- **Scripts operativos**: 6 nuevos (`ops:health`, `ops:readiness`, `ops:metrics`, `ops:alerts:test`, `ops:jobs:list`, `ops:status-report`).
- **Prisma migration**: 4 tablas nuevas (OperationalCheck, OperationalAlert, JobRun, SystemMetricsSnapshot), 4 enums nuevos.
- **Tests**: 38 unit tests de observabilidad, 20 E2E tests nuevos, 48 security checks (12 nuevos).
- **Documentacion**: ADR-021, ADR-022, OBSERVABILITY_ARCHITECTURE, HEALTH_CHECKS, ALERTING_POLICY, OPERATIONAL_RUNBOOK.

## Implementado (fase actual — Operaciones IA)

- **Proveedores de ruta**: 4 proveedores (disabled/simulated/google/waze-stub) con factory pattern. Google sanitiza API key.
- **Motor de recomendacion**: 12 criterios de puntuacion, descalificacion, nivel de riesgo, aislamiento multi-tenant.
- **Horarios de conductores**: horario semanal + excepciones (vacaciones, dia libre, incapacidad, turno extra).
- **Modelo de datos**: 6 modelos nuevos (TripStop, TripRouteEstimate, TripStopEstimate, DriverWorkSchedule, DriverAvailabilityException, DriverAssignmentRecommendation).
- **UI**: secciones de estimacion y recomendacion en tarjeta de viaje, pagina de horarios, dashboard de insights operativos, nav "Operaciones IA".
- **Server actions**: 8 acciones con requireTenantRole + audit + revalidatePath. Override requiere razon.
- **Tests**: 28 unit tests nuevos (14 rutas + 14 recomendacion), 7 E2E tests, 7 security checks nuevos.
- **Documentacion**: ADR-026/027/028, guias de arquitectura, setup Google Maps, motor de recomendacion.

## Base preservada

- Next.js App Router con TypeScript estricto.
- Docker (PostgreSQL 5433, MinIO, Mailpit, ClamAV 3310) saludable.
- Autenticacion Argon2id + sesiones opacas SHA-256 + cookies httpOnly SameSite Lax.
- MFA TOTP con AES-256-GCM, sesiones parciales, enforcement por rol.
- Flujo operativo completo cliente → operaciones → conductor → evidencia → POD → cierre.
- Cola offline del conductor con idempotencia server-side.
- Firma real embebida en el POD PDF.
- Pipeline de cuarentena de archivos con ClamAV.
- PWA instalable con fotos offline y sync engine.
- Aislamiento multitenant server-side (guards y filtros por `tenantId`).
- Recuperacion de contrasena con Mailpit.
- Gestion de sesiones activas.
- Backups cifrados AES-256-GCM con DR drill verificado.
- 66 E2E tests, 48 security checks.

## Riesgos residuales documentados

- **MFA-VULN-008** (backlog): WebAuthn/FIDO2 como opcion adicional de segundo factor.
- Perdida de dispositivo autenticador + codigos de recuperacion agotados requiere intervencion manual.
- Perdida de `BACKUP_ENCRYPTION_KEY` impide restaurar backups existentes.
- Dispositivo compartido del conductor — mitigado con logout guard, gestion de sesiones.
- `X-Forwarded-For` sin sanitizar detras de proxy no confiable.
- 2 advisories transitivas restantes (`effect` via Prisma CLI, `postcss` via Next+geist) — NOT_REACHABLE en runtime.

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md`.
