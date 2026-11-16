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

## 2026-11-13 Staging en la nube (ADR-036) y rediseño "Manifiesto del istmo"

- El dueño autorizó: GitHub público, Supabase (US$10/mes, us-east-1), Vercel (team Web
  Studio), ClamAV en Fly.io (unos US$12,70/mes) y rediseño de la cara pública y el portal.
- `APP_ENV`, `HttpAntivirusProvider`, gateway ClamAV, storage S3 configurable, health
  checks de nube, seed con secretos propios fuera de local, `binaryTargets` para Vercel.
- Supabase creado, migrado con el rol `nci_app`, endurecido y sembrado. Ataque por la Data
  API rechazado.
- Corregido: `override: true` de dotenv que redirigía `DATABASE_URL` a local en silencio.
- Rediseño aplicado y revisado en el navegador; corregidos 3 defectos visuales. Suite E2E
  101 + 2 flaky / 103.

## 2026-11-13 Auditoría de producción y endurecimiento (ADR-037)

- Auditoría de solo lectura con 6 lentes y verificación adversarial; 5 grupos de agentes
  implementaron las correcciones en archivos disjuntos y 2 revisores por grupo las revisaron.
- Integración: corregidos 28 problemas de revisión (test de MFA, bypass de creación de usuarios,
  guard de `db:reset`, visibilidad de documentos del cron y de las fotos offline, detección del POD
  por clave, avisos de invitaciones y usuarios, semilla coherente con el flujo de evidencia).
- Respaldo cifrado de Supabase staging y simulacro de restauración real en un Postgres local.
- Verificación: typecheck, lint, 596 unitarios, build, E2E 102 + 1 intermitente de 103.
- Las conexiones de Vercel, Supabase y Resend se desconectaron de la sesión; las claves de terceros
  quedaron pendientes del dueño.

## 2026-11-16 — Fase 1 de simplificación (ADR-038)

- Análisis de producto, diseño y revisión adversarial (5 lentes) previos; cimientos (esquema/migración, permisos, librerías, kit de UI) y luego pantallas y acciones: clientes, flota, lugares, tipos de servicio, Nuevo viaje, equipo opcional, Primeros pasos.
- Correcciones a lo existente: `DRIVER` sin ficha, portal (viewer y solicitudes de operaciones), `TableRow`, desborde móvil.
- Verificado: tsc, eslint, 1806 tests, security:check, build, E2E completa 101 + 3 flaky. Pendiente: acceso al portal, importación CSV, conductor usable, pruebas con BD real.
- Segunda parte: importación CSV (panel/acción), acceso de clientes al portal con correo de un solo uso, alta de conductor sin pantalla de error y vínculo conductor↔cuenta; E2E nuevos (CSV, portal, conductor) y 1822 tests. Código en la rama `feat/fase1-catalogos-nuevo-viaje`.

## 2026-11-16 — Pruebas con base de datos real (ADR-038)

- Nueva suite `pnpm test:db` (`vitest.db.config.ts`, `tests/db/`): 47 pruebas contra PostgreSQL local con tenants descartables `zz-db-*`, y guarda de destino (`scripts/lib/db-test-guard.ts`) que bloquea hosts remotos, pooler, perfiles distintos de `local` y nombres de base de staging/producción.
- Cubre referencias y bloqueo del tenant (incluida la forma real del `P2002`), carreras en los límites de plan, importación CSV, consultas de lectura y la migración de la Fase 1. Se verificó que las pruebas fallan cuando se rompe el código (7 mutaciones, 7 detectadas).
- Error real encontrado y corregido en `import-apply.ts`: una fila de clientes podía perderse en silencio por un código explícito repetido; ahora se evita y, si ocurre, se revierte con un mensaje claro.
- Verificado: tsc y eslint limpios, 1841 tests, `security:check`, `test:db` 47/47, E2E `csv-import` 2/2. Sin commit de esta tanda.

## 2026-11-16 — Invitaciones al equipo y comprobación de seguridad (ADR-038)

- El correo de invitación llevaba a `/invitacion/<token>`, que no existía. Implementada la página y la acción: cuenta nueva con contraseña propia o cuenta existente solo con su sesión, enlace de un solo uso atómico, sin escalada de rol, `/login?next=` estricto, `ServerForm` para no perder lo escrito.
- Hallazgo: `security-check.ts::grepMissing` fallaba por sintaxis de shell y varias comprobaciones pasaban en vacío; corregido (sin shell, falla si grep falla) y comprobado con un `fetch(` plantado.
- Verificado: tsc, eslint, 1876 tests, `test:db` 60/60, E2E invitaciones 3/3, `security:check`, `pnpm build`, mutaciones 7/7 y revisión visual (escritorio y 375 px). Sin repetir la E2E completa.

## 2026-11-16 — E2E de acceso y hora de la empresa (ADR-038)

- E2E nuevas de roles, aislamiento entre empresas y límites de plan (4 pruebas, 4 mutaciones detectadas). E2E completa de regresión: 114 pasan + 3 flaky preexistentes, 0 fallos.
- BIZ-08 corregido: el motor de recomendación de conductores, el contexto de IA, operations-insights y el cupo diario del copiloto leían día/hora de la zona del servidor; ahora usan Panamá (helpers en `datetime.ts`). Pruebas con 5 zonas de proceso y con BD real.
- Verificado: tsc, eslint, 1887 tests (UTC y Panamá), `test:db` 62/62, `security:check`, `pnpm build`.


## 2026-11-16 — Despliegue de la Fase 1 a staging (ADR-038)

- El dueño autorizó el despliegue ("Sí, desplegar"). Orden seguido: uso frente a plan (solo lectura) → backup cifrado verificado y restaurado en una base local descartable → `pnpm db:deploy` (solo `20261115181215_…` pendiente) → comprobación de RLS/privilegios en solo lectura → escaneo de secretos del parche → push de la rama → Preview de Vercel verificado (health `HEALTHY`, `/invitacion/[token]` responde con la base migrada, sin errores en logs).
- Hallazgo ajeno a la fase: caída transitoria del gateway ClamAV de Fly (health 503 ~1 minuto, recuperado solo). Sin acceso al panel de Fly no se investigó la causa.
- No se tecleó ninguna credencial en el sitio; los flujos con sesión quedan para recorrido manual. La fusión a `main` queda pendiente de confirmación. Los secretos de `.env.staging.local` se cargaron solo en el entorno de los procesos, sin imprimirlos.
