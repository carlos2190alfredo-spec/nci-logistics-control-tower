# CURRENT STATE

Fecha: 2026-11-16

## Fase 1 de simplificación (ADR-038)

Un tenant nuevo ya puede llegar solo a su primer viaje asignado: catálogos en autoservicio (clientes, flota, lugares, tipos de servicio con plantillas), "Nuevo viaje" creado por operaciones, equipo opcional según el tipo de servicio y la lista "Primeros pasos" en el Resumen. Migración aditiva `20261115181215_…` (aplicada a la BD local y, el 2026-11-16, a Supabase staging; la rama está en un Preview de Vercel verificado y **falta fusionarla a `main`**). Incluye importación CSV, acceso de clientes al portal y vínculo conductor↔cuenta. Cubierto además por `pnpm test:db` (47 pruebas con PostgreSQL local real: referencias, concurrencia, límites de plan, importación CSV, consultas y esquema). Las invitaciones al equipo ya funcionan de punta a punta (`/invitacion/[token]`). Cubierto por E2E de roles, aislamiento entre empresas y límites de plan, y el día/hora de la empresa (Panamá) ya no depende de la zona del servidor. Pendiente: confirmar cifras de plan y desplegar a staging. Detalle y riesgos en ADR-038 y `HANDOFF_LATEST.md`.

Anterior: 2026-11-13

## Endurecimiento para producción (ADR-037)

Una auditoría de solo lectura (6 lentes, verificación adversarial; 46 hallazgos, 40 confirmados,
ninguno crítico) se corrigió y se revisó con revisores independientes:

- **Correo único** (Resend por SMTP, con timeouts); nunca aborta una acción ya confirmada ni lleva
  contraseñas (enlace de un solo uso). `getAppBaseUrl()` sin fallback a `localhost` fuera de local.
- **Autorización:** regla de roles de propietario, páginas operativas con `tenant.view` (el
  conductor ya no abre el centro de control), la API de sincronización exige tenant activo y MFA,
  la evidencia nace `INTERNAL` y solo la publica la aprobación, las transiciones de evidencia solo
  existen por sus flujos dedicados.
- **Subidas:** 3 MiB por archivo y `bodySizeLimit` 4 mb (tope de Vercel ~4,5 MB); el navegador
  recodifica las fotos.
- **Cron diario** de mantenimiento (`CRON_SECRET`), caché del health público y límite de uso atómico.
- **Entorno fail-closed** (`APP_ENV` inválido lanza), guards de host en seed y `db:reset`,
  `prod:bootstrap`, `db:deploy`, `demo:purge`, respaldos contra Supabase (simulacro real hecho).
- **Frontend:** service worker con lista blanca, `robots`/`sitemap`/metadatos (indexable solo con
  `APP_ENV=production`), contraste AA, acentos y páginas 404 y de error en español.
- **Configurado el 2026-11-13 con los conectores:** `MAIL_PASSWORD` (Resend, solo envío, dominio
  `nciautomation.com`), `CRON_SECRET` (Production) y `APP_ENV=production` (Production; Preview
  sigue en `staging`). Cron verificado de punta a punta.
- **Clave S3 cargada (2026-11-13):** el health público responde 200 HEALTHY.
- **Pendiente:** probar una subida real de evidencia y un correo real desde la app (con sesión) y,
  opcional, `OPS_ALERT_EMAIL`.

## Staging en la nube (ADR-036) y rediseño de la cara pública

- **Perfiles `APP_ENV` (local | staging | production).** Fuera de local:
  - no se muestran credenciales demo;
  - el storage no acepta las claves por defecto de MinIO;
  - el seed exige `SEED_PASSWORD` y `SEED_TOTP_SECRET`.
- **Supabase `nci-lct-staging`** (us-east-1) con el rol `nci_app`:
  - migrado, endurecido (RLS 70/70, Data API cerrada) y sembrado;
  - bucket privado `nci-lct-staging`.
- **Antivirus por gateway HTTPS con token** (`HttpAntivirusProvider` +
  `infra/clamav-gateway`), con destino Fly.io.
- **Repo público** `carlos2190alfredo-spec/nci-logistics-control-tower`.
- **Rediseño "Manifiesto del istmo"** (`docs/design/CREATIVE_DIRECTION.md`):
  - landing, login y portal del cliente;
  - los paneles internos heredan los neutros cálidos y la tipografía Archivo en títulos;
  - componentes `IsthmusRoute` y `ManifestProgress`.
- **Pendiente:**
  - desplegar Vercel y Fly;
  - credenciales S3 y SMTP (Resend) cargadas por el dueño;
  - verificación en staging.


## Datos locales y E2E (2026-11-12, tras ADR-035)

- El seed refresca al re-ejecutarse los vencimientos de cumplimiento y las fechas de
  contenedores, que son relativos a "hoy". La póliza VH-1 vence el 2027-01-31.
- `pnpm e2e:cleanup` (dry-run por defecto; `--apply` borra) elimina los viajes que dejan
  los E2E en tenants demo y conserva los del seed. La DB local quedó con 10 + 5 viajes.
- ClamAV local debe estar arriba para `file-security` y E2E-FLOW-001:
  `docker compose up -d clamav`.
- E2E completa: 103/103 en verde, sin reintentos, desde DB limpia. Todas las specs usan
  `tests/e2e/helpers/auth.ts`.

## Fase actual — Remediación P0 del núcleo operativo (ADR-035)

Una auditoría (2026-11-12) encontró cuatro problemas P0 en el flujo de viajes y
solicitudes. Quedaron corregidos:

- **Cancelación y excepciones:**
  - un viaje se puede cancelar desde cualquier estado previo a la entrega, con motivo
    obligatorio (después de cargar, solo los mandos pueden cancelar);
  - nuevo estado `DELIVERY_FAILED` con reintento o retorno (`→ IN_TRANSIT`);
  - la espera en origen es opcional;
  - se puede reasignar hasta `DRIVER_CONFIRMED`.
- **Solicitudes:**
  - operaciones puede pedir información o rechazar;
  - el cliente puede responder, enviar un borrador o cancelar;
  - el motivo visible al cliente vive en `ServiceRequest.statusReason`;
  - las acciones están en `src/lib/server/request-actions.ts`.
- **Mensajes en vez de fallos silenciosos:** `ActionResult` + `ActionForm`. Asignar,
  avanzar, registrar, aprobar o rechazar evidencia y convertir solicitudes explican la
  causa exacta de cada bloqueo.
- **Concurrencia:**
  - bloqueo optimista (`updateMany` con el estado leído) en las transiciones online y
    offline, en la evidencia y en las solicitudes;
  - `SELECT … FOR UPDATE` en la asignación, para evitar doble reserva.
- **Bypass cerrado:** aceptar o anular una recomendación de conductor ya no escribe
  `trip.driverId` sin guardas.
- **Migración aditiva** `20261112120000_trip_exceptions_and_request_reasons`: agrega el
  valor de enum y dos columnas que admiten nulos.

Pendiente de la auditoría (P1/P2):

- RLS o claves foráneas compuestas por tenant;
- enlace de cumplimiento y mantenimiento por UUID;
- estado de activos como enum;
- ventana de conflicto basada en la duración y los horarios del conductor;
- moneda en finanzas;
- partir `actions.ts`;
- tests de integración con base de datos;
- limpieza de la documentación.

## Fase previa — Cierre de código (2026-07-23)

## Fase actual — Cierre de código listo para producción

Sobre la base production-ready se construyó la capa logística de Panamá
(FASE 0–7 completas): cumplimiento documental, contenedores
(demurrage/detention), combustible y mercancías peligrosas, dashboards por
rol, rentabilidad y salud de conectores. Post-piloto se cerró la capa
audit-and-support: excepciones aprobadas de cumplimiento/mantenimiento,
reportes PDF de cumplimiento y finanzas con branding del tenant, modo soporte
auditado con banner visible y E2E de todos los módulos Panamá.

Toda la lógica de elegibilidad/alertas/cargos/rentabilidad es **determinista**
(sin IA); las integraciones externas quedan declaradas como `Disabled*`
(preparadas, no simuladas). Ver `HANDOFF_PANAMA.md` para el informe completo.

Baseline: **303 unit tests**, typecheck ✅, lint 0 warnings ✅, build ✅,
E2E Panamá 10/10 verde, resto del suite E2E estabilizado contra rate-limit
MFA (globalSetup + retries). El trabajo restante son bloqueantes externos de
infraestructura (managed Postgres, S3, SMTP con dominio verificado, vault de
secretos, backups, sink de logs) — no de código.

### Módulos Panamá (nuevos)

- **Cumplimiento:** ComplianceDocument/Rule, vencimientos, semáforo advisory,
  `/t/[slug]/compliance`.
- **Contenedores:** ciclo de 26 estados, free-time/demurrage/detention,
  `/t/[slug]/containers`.
- **Combustible/Hazmat:** readiness desde documentos, aprobación humana,
  `/t/[slug]/hazmat`.
- **Rentabilidad:** margen por viaje/cliente/ruta, `/t/[slug]/finance`.
- **Salud de conectores:** en `/t/[slug]/admin/integrations`.
- **Dashboard cross-módulo** en el Resumen; **"qué sigue"** en el portal.

## Base previa — Production Readiness

Verificación automática de correo al alta de tenants y usuarios, CI/CD,
`.env.example`, guía de despliegue, limpieza de lint.

## Implementado (fase actual — Email Verification y Production Readiness)

- **Verificacion de correo**:
  - Nuevos campos `emailVerifyToken` (String, unique) y `emailVerifyTokenExpiresAt` (DateTime) en el modelo `User`.
  - `email-verification.ts`: `generateEmailVerifyToken()`, `sendVerificationEmail()`, `verifyEmailToken()` (idempotente para tolerar React Strict Mode double-render).
  - Pagina `/verificar-email/[token]` — server-rendered, mensajes en español, instrucciones de MFA post-verificacion.
  - TTL 48h.
- **Plantillas de correo profesionales** (`email-templates.ts`):
  - `welcomeTenantOwnerEmail()` — bienvenida al owner con verificacion + contraseña temporal + instrucciones MFA.
  - `welcomeUserEmail()` — bienvenida a nuevo miembro (invitado por, rol, contraseña temporal).
  - `emailVerificationEmail()` — reenvio de verificacion.
  - `invitationEmail()` — invitacion con enlace y expiracion.
  - HTML inline CSS, header `NCI Logistics Control Tower`, boton CTA `#2563eb`, aviso de expiracion.
- **Envio automatizado**:
  - `createTenantFullAction` genera token y envia welcome al owner.
  - `createTenantUserAction` genera token y envia welcome al usuario.
  - `createInvitation` usa la plantilla profesional.
- **SMTP con auth para produccion**: `mail.ts` acepta `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_SECURE` para SES/SendGrid/Postmark/Resend.
- **`.env.example` completo**: documenta 40+ variables agrupadas por categoria.
- **CI/CD**:
  - `.github/workflows/ci.yml` — lint + typecheck + tests + security check + build en Postgres 17.
  - `.github/workflows/e2e.yml` — Playwright E2E con Postgres/MinIO/Mailpit.
- **Guia de despliegue** (`docs/DEPLOYMENT.md`): arquitectura de referencia, checklist de secretos, pasos de DB/S3/SMTP/ClamAV, headers HTTP, rate-limit distribuido, observabilidad, backups, checklist de seguridad post-deploy.
- **Lint clean**: eslint config ahora respeta `_` como convencion de "unused intencional". 0 warnings, 0 errores.
- **ADR-033**: documenta el flujo de verificacion de correo y la decision de idempotencia.

## Implementado (fase previa — Operaciones IA)

- **Proveedores de ruta**: 4 proveedores (disabled/simulated/google/waze-stub) con factory pattern. Google sanitiza API key.
- **Motor de recomendacion**: 12 criterios de puntuacion, descalificacion, nivel de riesgo, aislamiento multi-tenant.
- **Horarios de conductores**: horario semanal + excepciones (vacaciones, dia libre, incapacidad, turno extra).
- **Modelo de datos**: 6 modelos nuevos (TripStop, TripRouteEstimate, TripStopEstimate, DriverWorkSchedule, DriverAvailabilityException, DriverAssignmentRecommendation).
- **UI**: secciones de estimacion y recomendacion en tarjeta de viaje, pagina de horarios, dashboard de insights operativos, nav "Operaciones IA".
- **Server actions**: 8 acciones con requireTenantRole + audit + revalidatePath. Override requiere razon.
- **Documentacion**: ADR-026/027/028.

## Implementado (fase previa — Observabilidad)

- Request ID, logger estructurado JSON, error handling con `AppError`, health checks (PG/Prisma/MinIO/ClamAV/Mailpit), 19 metricas, alertas con dedup, job runner observado, PWA telemetry con allowlist, dashboard `/platform/system-status`.
- ADR-021, ADR-022.

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

## Conteos

- Unit tests: 170 (Vitest).
- E2E tests: 87 (Playwright).
- Security checks: 55.
- Prisma migrations: 17 (agregada `20260715060000_add_email_verification_fields`).
- ADRs: 33 (ADR-001 a ADR-033).

## Riesgos residuales documentados

- **MFA-VULN-008** (backlog): WebAuthn/FIDO2 como opcion adicional de segundo factor.
- Perdida de dispositivo autenticador + codigos de recuperacion agotados requiere intervencion manual.
- Perdida de `BACKUP_ENCRYPTION_KEY` impide restaurar backups existentes.
- Dispositivo compartido del conductor — mitigado con logout guard, gestion de sesiones.
- `X-Forwarded-For` sin sanitizar detras de proxy no confiable.
- 2 advisories transitivas restantes (`effect` via Prisma CLI, `postcss` via Next+geist) — NOT_REACHABLE en runtime.

## Faltantes para el go-live (infraestructura)

Todos son decisiones de despliegue, no de codigo. Ver [`DEPLOYMENT.md`](DEPLOYMENT.md).

- Remote Git y CI conectado.
- PostgreSQL managed (RDS/Cloud SQL/Supabase/Neon).
- Bucket S3 con acceso privado y CORS.
- Proveedor SMTP transaccional con dominio verificado.
- Dominio + TLS.
- Vault de secretos (SSM/Doppler/Vault).
- Backups automatizados programados.
- Sink de logs.

## Ultima verificacion

Ver [`VERIFICATION_LATEST.md`](VERIFICATION_LATEST.md).
