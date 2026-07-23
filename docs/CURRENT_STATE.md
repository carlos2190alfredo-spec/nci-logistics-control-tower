# CURRENT STATE

Fecha: 2026-07-23

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
