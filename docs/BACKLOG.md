# BACKLOG

## Producción — bloqueantes externos (fuera del alcance del código)

- Configurar remote Git (GitHub/GitLab) y conectar CI (workflows ya listos en `.github/workflows/`).
- Provisionar PostgreSQL managed (RDS/Cloud SQL/Supabase).
- Provisionar bucket S3 con acceso privado y CORS.
- Configurar proveedor SMTP transaccional (SES/SendGrid/Postmark/Resend) con dominio verificado.
- Provisionar dominio + certificado TLS.
- Configurar vault de secretos (SSM/Doppler/Vault).
- Programar backups automatizados y DR drill trimestral.
- Configurar Redis para rate-limit distribuido (opcional; también se puede hacer en el WAF).
- Configurar sink de logs (CloudWatch/Datadog/Grafana Cloud).

Ver [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Mejoras post-lanzamiento

- **WebAuthn/FIDO2** como segundo factor adicional (MFA-VULN-008).
- Exportacion CSV de reportes (viajes, feedback, auditoria).
- Reinicio programado de tenant demo (comando existente `demo:reset` — falta programarlo con cron).
- Modo soporte con salida visible y cierre auditado.
- Mejora del render visual de firma en el POD PDF.
- Cola IndexedDB idempotente para conductor (offline ya funciona; mejora de UX).

## Deuda técnica

- Reducir 2 advisories transitivas restantes (`effect` via Prisma CLI, `postcss` via Next+geist) — actualmente `NOT_REACHABLE` en runtime, documentado en `DEPENDENCY_REACHABILITY.md`.
- Reducir advertencia Turbopack/Prisma si se vuelve bloqueante.

## Completado

- ~~Cambio y recuperacion de password por Mailpit~~ (ya implementado)
- ~~Verificacion de correo al crear tenant y usuarios~~ (2026-07-15 — ver ADR-033)
- ~~Plantillas de email profesionales~~ (2026-07-15 — HTML con branding NCI)
- ~~SMTP con autenticacion para produccion~~ (2026-07-15 — `mail.ts` soporta `MAIL_USER`/`MAIL_PASSWORD`/`MAIL_SECURE`)
- ~~`.env.example` con documentacion completa~~ (2026-07-15)
- ~~Workflows de CI (lint/typecheck/test/build/security + E2E)~~ (2026-07-15)
- ~~Guia de despliegue en produccion~~ (2026-07-15 — `docs/DEPLOYMENT.md`)
- ~~Limpieza de lint warnings~~ (2026-07-15 — 0 warnings)
