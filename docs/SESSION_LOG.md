# SESSION LOG

## 2026-07-09

- Se inspecciono un workspace vacio salvo `.git`.
- Se creo una app Next.js App Router.
- Se instalaron dependencias locales: Prisma, Argon2, Zod, nodemailer, AWS SDK S3, PDFKit, Vitest, Playwright.
- Se definio infraestructura Docker local.
- Se creo modelo Prisma multitenant y migracion inicial.
- Se implementaron auth, autorizacion, pantallas y seed demo.
- Se ejecutaron verificaciones de codigo.
- Docker Compose quedo bloqueado porque el daemon de Docker no estaba corriendo.

## 2026-07-09 Runtime Validation

- Docker Desktop estaba activo y Docker Compose v5.0.2 disponible.
- `pnpm local:up` fallo inicialmente porque `localhost:5432` estaba ocupado.
- Se cambio el puerto host de PostgreSQL del proyecto a `5433` mediante `POSTGRES_HOST_PORT`, manteniendo `5432` dentro del contenedor.
- PostgreSQL, MinIO y Mailpit quedaron saludables.
- Se aplico la migracion inicial contra PostgreSQL real.
- Se inicializo bucket MinIO `nci-logistics-local`.
- Se corrigio `prisma/seed.ts` para cargar `.env.local`.
- Seed paso dos veces y no genero duplicados en claves criticas.
- Se corrigio login de usuarios cliente para redirigir al portal del tenant.
- Se agregaron pruebas E2E de aislamiento multitenant, aislamiento entre clientes y restriccion de viajes del conductor.
- Mailpit recibio correo de prueba.
- MinIO recibio objeto demo bajo prefijo de tenant y nego acceso publico sin firma.
- `pnpm test:e2e` paso con 6 pruebas.
- `pnpm verify` paso completo.

## 2026-07-09 End-to-End Workflow

- Se agregaron migraciones para `trip_assignments`, estado de prueba de entrega e idempotencia de solicitudes de cliente.
- Se implemento solicitud operacional completa desde portal cliente.
- Se implemento conversion a viaje, asignacion con validaciones y bitacora de asignaciones.
- Se implemento evidencia de conductor con upload real a MinIO, firma digital e incidencia visible al cliente.
- Se implemento aprobacion de evidencia, generacion de POD PDF, documentos customer-visible y signed URLs.
- Se agregaron rutas API para POD y documentos autorizados con aislamiento tenant/customer.
- Se agrego E2E serial del flujo solicitud -> viaje -> asignacion -> conductor -> incidencia -> evidencia/firma -> aprobacion -> POD -> cierre -> cliente.
- Se agregaron pruebas negativas para tenant cruzado, cliente cruzado y conductor no asignado.
- `pnpm test:e2e` paso con 10 pruebas.
- `pnpm verify` paso completo despues de seed doble.

## 2026-07-09 Rediseño UI/UX integral

- Auditoría visual con screenshots de referencia (docs/UI_UX_AUDIT.md, docs/ui-audit/).
- Sistema de diseño: tokens semánticos CSS (Tailwind 4 @theme), tipografía Geist local (geist@1.5.1), iconografía Lucide, componentes UI reutilizables y estados del dominio en español.
- Shells por perfil: sidebar colapsable persistente + drawer móvil + topbar; DriverShell móvil-primero con indicador real de conectividad.
- Rediseño de home, login, 404/error, panel de plataforma, centro de control, configuración, portal cliente y PWA conductor; loading.tsx con skeletons por ruta.
- Centro de control: lista operativa de viajes activos con acciones contextuales al estado + historial separado (corrige fallo E2E baseline por take:20 con datos acumulados); rechazo de evidencia con motivo expuesto en UI.
- Animaciones CSS discretas con prefers-reduced-motion (ADR-006, docs/ANIMATION_GUIDELINES.md); sin librería de animación.
- Correcciones: ids únicos con useId en campos repetidos por tarjeta, buttonStyles extraído a módulo puro, minmax(0,fr) en grids con tablas, firma sin trazo demo.
- `pnpm verify` paso completo; `pnpm test:e2e` paso 10/10; verificación a11y/reduced-motion por script; 0 errores de consola en 4 viewports.

## 2026-07-09 Offline-first driver + security hardening

- Migración `20260709180000_offline_sync_and_rate_limit`: tablas `offline_command_receipts` y `rate_limit_buckets`.
- Modelo offline cliente (IndexedDB) aislado por owner con backoff exponencial, `useSyncExternalStore` y provider por conductor.
- Endpoint `POST /api/t/[tenantSlug]/driver/sync` con Origin check, rate limit persistente, idempotencia por `payload_hash` y auditoría de manipulación (`PAYLOAD_TAMPERED`).
- Whitelist server-side de acciones offline y transiciones por rol DRIVER; máquina de estados reutilizada.
- Firma real embebida en el POD PDF con `pdfkit.standalone` y data URL PNG validado por longitud mínima.
- SignaturePad inicia sin trazo demo, con marca digital de captura.
- Headers de seguridad globales en next.config.ts (CSP, nosniff, X-Frame, Referrer-Policy, Permissions-Policy, COOP/CORP).
- Service worker v2 con blocklist de rutas privadas (`/api`, `/platform`, `/t/`) y hosts MinIO.
- Uploads validan magic bytes; signed URLs con TTL 60 s y Content-Disposition attachment.
- Logger centralizado con redacción; códigos de error seguros.
- `nodemailer` 7 → 9.0.3 (parches SMTP command injection y CRLF).
- Scripts nuevos: `pnpm security:check`, `pnpm security:test`, `pnpm security:audit`.
- Documentación: THREAT_MODEL, OFFLINE_ARCHITECTURE, OFFLINE_SECURITY, SECURITY_HARDENING, SECURITY_CHECKLIST, INCIDENT_RESPONSE, ADR-007, ADR-008.

## 2026-07-10 Auditoría independiente + remediación P0/P1

- Auditoría independiente (docs/CLAUDE_SECURITY_AUDIT.md) con 8 hallazgos + 3 análisis de dependencia. Plan (docs/SECURITY_REMEDIATION_PLAN.md) commiteado antes de tocar código.
- VULN-001 (P0): race en offline sync corregida con receipt-first transaction.
- VULN-002 (P1): signIn revoca sesión previa del mismo navegador (mitigación de fixation).
- VULN-003 + VULN-004 (P1): flujo completo de recuperación de contraseña con Mailpit, token con hash SHA-256, TTL 20min, un solo uso, revocación de tokens previos, rate limit doble, invalidación de todas las sesiones tras reset.
- VULN-005 (P1): página /account/sessions con SessionSummary (sin hashes ni User-Agent completo), acciones cerrar-una/otras/todas.
- VULN-007 (P2): currentServerState eliminado en respuestas ASSIGNMENT_CHANGED.
- VULN-DEP-001 (P1): @aws-sdk/client-s3 → 3.1083.0 cerró 7 advisories (incluye 1 crítica y 4 altas).
- VULN-DEP-002 y VULN-DEP-003: documentadas como NOT_REACHABLE en docs/DEPENDENCY_REACHABILITY.md.
- Nueva migración 20260710080000_session_metadata_and_reset_revocation (user_agent, ip_hash, last_seen_at, revoked_at, requested_ip_hash).
- 5 comprobaciones estáticas nuevas en pnpm security:check (15/15).
- 28/28 unit tests + 23/23 E2E (incluye 4 SEC-AUTH nuevos).
- ADR-009 (rotación/revocación) + ADR-010 (recuperación).

## 2026-07-12 Observabilidad y monitoreo operativo

- Auditoria de 20 gaps de observabilidad (OBS-001 a OBS-020) documentados en OPERABILITY_AUDIT.md.
- Request ID por request via middleware de Next.js (X-Request-ID).
- Logger estructurado con 8 niveles, salida JSON, 30+ claves sensibles redactadas automaticamente.
- AppError con categorias y codigos seguros. error.tsx muestra digest sin detalles internos.
- Health checks para PostgreSQL, Prisma, MinIO, ClamAV, Mailpit con timeout de 5s.
- Metricas operativas: 19 queries paralelas (tenants, usuarios, sesiones, MFA, viajes, archivos, offline, backups, alertas).
- Alertas con deduplicacion (dedupeKey), cooldown por severidad, notificacion via Mailpit.
- Job runner con runObservedJob() que persiste en tabla JobRun.
- PWA telemetry endpoint con allowlist estricta, rechazo de base64/data URLs, rate limit 10/min.
- Dashboard de estado en /platform/system-status (14 secciones, role-gated + MFA).
- 4 API endpoints internos (health, liveness, readiness, metrics).
- Prisma migration con 4 tablas y 4 enums nuevos.
- 6 scripts operativos (ops:health, ops:readiness, ops:metrics, ops:alerts:test, ops:jobs:list, ops:status-report).
- 12 security checks nuevos (48 total).
- 20 E2E tests nuevos (66 total).
- 38 unit tests de observabilidad.
- Documentacion: ADR-021, ADR-022, OBSERVABILITY_ARCHITECTURE, HEALTH_CHECKS, ALERTING_POLICY, OPERATIONAL_RUNBOOK.

## 2026-11-12 Auditoría y remediación P0 del núcleo operativo (ADR-035)

- Auditoría de solo lectura: arquitectura, auth, multitenant, lógica de viajes, finanzas y
  documentación. Hallazgos priorizados P0, P1 y P2.
- Cancelación con motivo; `DELIVERY_FAILED` con reintento o retorno; espera en origen
  opcional; reasignación hasta `DRIVER_CONFIRMED`.
- Máquina de estados de solicitudes: pedir información, rechazar, responder, enviar
  borrador, cancelar (`statusReason` visible al cliente).
- `ActionResult` + `ActionForm`: mensajes de bloqueo en lugar de `return;` silenciosos.
- Bloqueo optimista en las transiciones online y offline, en la evidencia y en las
  solicitudes; `FOR UPDATE` en la asignación.
- Rechazar evidencia devuelve el viaje a `EVIDENCE_PENDING`.
- Cerrado el bypass de aceptar o anular una recomendación de conductor.
- Migración aditiva `20261112120000_trip_exceptions_and_request_reasons`.
- Verificación:
  - typecheck, lint 0/0, 317 tests unitarios, `security:check` 77/77, build;
  - 6 E2E nuevos;
  - `offline-sync` 9/9.
- Hallazgos de entorno documentados en `VERIFICATION_LATEST.md`: seed vencido, 246 viajes
  acumulados que tumban el dev server, carrera de login en un helper E2E.

## 2026-11-12 Seed renovable y limpieza de datos E2E

- Causa raíz del seed vencido: los `upsert` de cumplimiento y contenedores usaban
  `update: {}`, así que re-sembrar no refrescaba las fechas relativas. Ahora las refrescan.
- Nuevo `scripts/e2e-cleanup.ts` (`pnpm e2e:cleanup`, dry-run por defecto). Aplicado tras
  un `pg_dump`: 295 viajes E2E y sus dependencias borrados; 142 objetos de MinIO.
- ClamAV local levantado (estaba detenido desde hace 3 meses).
- E2E completa: el dev server ya no se cae; E2E-FLOW-001 pasa con ClamAV. Los fallos
  restantes son todos la carrera de hidratación de los helpers `login`.

## 2026-11-12 Helper de login compartido y suite E2E en verde

- `tests/e2e/helpers/auth.ts` reemplaza 11 helpers duplicados (−190 líneas). Espera la
  hidratación del formulario: antes el `fill` temprano se perdía y el envío salía con el
  usuario por defecto (`platform@nci.local`) o se quedaba en `/login`.
- FILE-SEC-004/008 y PHOTO-SYNC/PHOTO-EXIF dejan de depender de datos sobrantes.
- Suite completa: 103/103, sin reintentos ni omitidos.
