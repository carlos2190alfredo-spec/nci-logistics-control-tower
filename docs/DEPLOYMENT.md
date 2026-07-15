# Guía de despliegue en producción

Documento oficial para desplegar NCI Logistics Control Tower en un entorno de producción.

Fecha: 2026-07-15

---

## 1. Arquitectura de referencia

```
                    ┌──────────────┐
                    │  Cloudflare  │  HTTPS + DDoS + WAF
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Load Balancer│  ALB / Cloud Load Balancer
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐┌─────▼─────┐┌─────▼─────┐
        │  App #1   ││  App #2   ││  App #3   │  Next.js (Node 24)
        │  :3000    ││  :3000    ││  :3000    │
        └─────┬─────┘└─────┬─────┘└─────┬─────┘
              │            │            │
    ┌─────────┼────────────┼────────────┼─────────┐
    │         │            │            │         │
┌───▼───┐┌────▼────┐┌──────▼─────┐┌────▼────┐┌───▼───┐
│Postgres││ MinIO / ││   Redis    ││ ClamAV  ││ SMTP  │
│ (RDS)  ││   S3    ││(rate-limit)││ (ECS)   ││ (SES) │
└────────┘└─────────┘└────────────┘└─────────┘└───────┘
```

**Componentes mínimos:**
- Node.js 24 runtime (Fargate, Cloud Run, Kubernetes, o VM).
- PostgreSQL 17 managed (RDS, Cloud SQL, Supabase, Neon).
- Almacenamiento S3-compatible (AWS S3, MinIO, R2, GCS).
- SMTP transaccional (SES, SendGrid, Postmark, Resend).
- ClamAV daemon (para el pipeline de cuarentena de archivos).
- Cloudflare o WAF frente a la app.

---

## 2. Prerrequisitos

- [ ] Dominio con DNS controlado (por ejemplo `app.nci.example`).
- [ ] Certificado TLS válido (Let's Encrypt / ACM).
- [ ] Instancia Postgres con `pgcrypto` disponible.
- [ ] Bucket S3 con acceso privado y CORS configurado para el dominio.
- [ ] Cuenta SMTP con sender verificado (`no-reply@nci.example` u otro).
- [ ] Vault de secretos (AWS SSM, Doppler, GitHub secrets, HashiCorp Vault).

---

## 3. Configuración de secretos

Generar todas las claves de encriptación:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # MFA_ENCRYPTION_KEY
openssl rand -hex 32   # INTEGRATION_ENCRYPTION_KEY
openssl rand -hex 32   # BACKUP_ENCRYPTION_KEY
openssl rand -hex 32   # SESSION_METADATA_KEY (opcional)
```

**Reglas críticas:**
- Las claves de encriptación se guardan **una sola vez** en el vault. Nunca en Git.
- `MFA_ENCRYPTION_KEY` — rotarla invalida todos los MFA registrados. Documentar el proceso de rotación (re-enrollment forzado).
- `BACKUP_ENCRYPTION_KEY` — perderla hace irrecuperables los backups existentes. Guardar copia offline en caja fuerte o KMS.
- `SESSION_SECRET` — rotarla invalida todas las sesiones activas.

Ver [`.env.example`](../.env.example) para la lista completa de variables y sus formatos.

---

## 4. Base de datos

### 4.1 Provisionar

Crear la instancia Postgres 17 con:
- Backups automáticos ≥ 7 días.
- Multi-AZ o réplica en pie.
- Encriptación at-rest habilitada.
- Conexiones SSL forzadas.

### 4.2 Migrar

```bash
DATABASE_URL="postgresql://..." pnpm prisma migrate deploy
```

### 4.3 Seed inicial

Para el primer despliegue, crear el super admin de plataforma:

```bash
DATABASE_URL="postgresql://..." pnpm db:seed
```

O manualmente:

```sql
-- Crear usuario platform admin
INSERT INTO "User" (id, name, email, "passwordHash", "emailVerified", "platformRole")
VALUES (gen_random_uuid(), 'Admin', 'admin@nci.example',
        -- Hash generado con argon2 (pnpm tsx scripts/create-admin.ts)
        '$argon2id$...',
        true, 'PLATFORM_SUPER_ADMIN');
```

---

## 5. Almacenamiento (S3 / MinIO)

Crear el bucket con:
- Acceso privado (bloqueo de acceso público).
- CORS permitiendo el dominio de producción para `GET`, `PUT`, `POST`.
- Versionado habilitado (recomendado).
- Ciclo de vida: mover a `STANDARD_IA` a los 30 días, `GLACIER` a los 90.

Inicializar la estructura:

```bash
MINIO_ENDPOINT=... MINIO_BUCKET=... pnpm storage:init
```

---

## 6. Correo (SMTP)

Configurar un proveedor transaccional con dominio verificado:

**AWS SES** (recomendado si ya está en AWS):
- Verificar el dominio `nci.example` (SPF, DKIM, DMARC).
- Solicitar salida del sandbox.
- `MAIL_HOST=email-smtp.us-east-1.amazonaws.com`, `MAIL_PORT=587`, `MAIL_SECURE=false`.

**SendGrid / Postmark / Resend** — seguir su guía; verificar SPF/DKIM.

Probar el envío después de configurar:

```bash
MAIL_HOST=... MAIL_PORT=... MAIL_USER=... MAIL_PASSWORD=... \
node -e "require('./src/lib/server/mail').sendMail({to:'you@example.com',subject:'Test',text:'ok'})"
```

---

## 7. Antivirus (ClamAV)

Los uploads de archivos pasan por ClamAV antes de ser aceptados. Opciones:

- **Sidecar container** (recomendado): correr `clamav/clamav:1.4` junto a la app en la misma red privada.
- **Servicio dedicado** (Fargate/K8s): un servicio ClamAV con auto-scaling.

Configurar `CLAMAV_HOST` y `CLAMAV_PORT` (por defecto 3310).

Probar con EICAR:

```bash
pnpm files:test:eicar
```

---

## 8. Build y despliegue de la app

### 8.1 Construir imagen Docker

```bash
docker build -t nci-lct:$(git rev-parse --short HEAD) .
docker tag nci-lct:$(git rev-parse --short HEAD) registry.example/nci-lct:latest
docker push registry.example/nci-lct:latest
```

### 8.2 Variables de entorno para producción

Ver [`.env.example`](../.env.example). En producción:
- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL=https://app.nci.example`
- Todos los secretos vienen del vault, no del filesystem.

### 8.3 Migraciones al desplegar

Estrategia recomendada: correr `prisma migrate deploy` como parte del pipeline de despliegue, **antes** de reiniciar la app.

```yaml
# GitHub Actions ejemplo
- run: DATABASE_URL=$DB pnpm prisma migrate deploy
- run: ./deploy.sh  # reinicia la app
```

---

## 9. Cabeceras HTTP y CSP

`next.config.ts` ya incluye Content-Security-Policy, HSTS, Referrer-Policy, X-Content-Type-Options.

Verificar tras el despliegue:

```bash
curl -I https://app.nci.example
```

Debe incluir:
- `Content-Security-Policy: default-src 'self'; ...`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 10. Rate limiting distribuido

El módulo `src/lib/server/rate-limit.ts` usa store en memoria por defecto. Con múltiples instancias hay que compartir el estado:

- **Opción recomendada**: Redis (Elasticache, MemoryStore, Upstash) con `ioredis`.
- **Alternativa**: rate-limit en la capa del load balancer / WAF (Cloudflare Rate Limiting rules).

Reemplazar el store en `rate-limit.ts` por Redis si se quiere el limit en la app.

---

## 11. Observabilidad

El logger emite JSON estructurado a stdout. Enviar a:
- **CloudWatch Logs / Cloud Logging** — captura nativa desde el orquestador.
- **Datadog / New Relic / Grafana Cloud** — vía OpenTelemetry o agente.
- **Sentry** — para errores no capturados (agregar SDK si se desea).

Endpoints de salud:
- `GET /api/health` — público, liveness.
- `GET /api/health/ready` — requiere auth, readiness completo.
- `GET /api/metrics` — requiere auth, métricas para dashboards.

Configurar alertas en el WAF/monitor:
- 5xx > 1% durante 5 min → P1.
- Latencia p99 > 3s durante 10 min → P2.
- `/api/health` falla 3 veces seguidas → P0.

---

## 12. Backups

### 12.1 Backup automatizado

Usar los scripts existentes en cron o CI programado:

```bash
BACKUP_ENCRYPTION_KEY=... pnpm backup:all
```

Programar diariamente (por ejemplo con GitHub Actions on schedule, EventBridge, Cloud Scheduler).

### 12.2 DR drill trimestral

Ejecutar el drill de recuperación cada 90 días:

```bash
pnpm backup:drill
```

Documentar el resultado en `docs/BACKUP_RESTORE_DRILL_LATEST.md`.

### 12.3 Retención

Ver [`BACKUP_RETENTION_POLICY.md`](BACKUP_RETENTION_POLICY.md).

---

## 13. Seguridad post-deploy — checklist

- [ ] TLS/HSTS activo (probar con `https://securityheaders.com`).
- [ ] Todos los endpoints públicos requieren auth (excepto `/api/health` y `/login`).
- [ ] Todos los secrets están en el vault (no en `.env` en el filesystem).
- [ ] MFA obligatoria para roles `PLATFORM_SUPER_ADMIN` y `PLATFORM_SUPPORT`.
- [ ] Cookies con `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] CSP no permite `unsafe-eval` ni orígenes externos innecesarios.
- [ ] Rate limit activo en `/login`, `/api/mfa/*`, `/api/offline-sync`.
- [ ] Backups probados (restauración verificada).
- [ ] Logs no contienen secretos (verificar con `pnpm ops:status-report`).
- [ ] `pnpm security:check` pasa 100%.
- [ ] `pnpm audit --prod` sin CVEs críticos.

---

## 14. Verificación funcional post-deploy

Probar los flujos clave manualmente o con Playwright contra el entorno:

- [ ] Crear tenant desde el platform panel → llega email de bienvenida al owner.
- [ ] Owner verifica correo → puede iniciar sesión.
- [ ] Owner configura MFA → obliga MFA en el próximo login.
- [ ] Owner crea usuario dispatcher → llega email de bienvenida.
- [ ] Dispatcher verifica correo → puede iniciar sesión.
- [ ] Crear un viaje completo (cliente → operaciones → conductor → POD).
- [ ] Descargar POD PDF → firma embebida visible.
- [ ] Página `/platform/system-status` reporta todo verde.

---

## 15. Rollback

Cada release debe poder revertirse:

- **App**: mantener las últimas 3 imágenes en el registro; `docker service update --rollback` o equivalente.
- **DB**: **no** hacer rollback automático de migraciones. Si una migración corrompe datos, restaurar del backup más reciente y reaplicar cambios manualmente.
- **Storage**: bucket con versionado permite restaurar objetos.

Documentar el ejecutivo del rollback en `docs/OPERATIONAL_RUNBOOK.md`.

---

## 16. Referencias

- [`AUTHENTICATION_SECURITY.md`](AUTHENTICATION_SECURITY.md)
- [`BACKUP_ARCHITECTURE.md`](BACKUP_ARCHITECTURE.md)
- [`ALERTING_POLICY.md`](ALERTING_POLICY.md)
- [`OPERATIONAL_RUNBOOK.md`](OPERATIONAL_RUNBOOK.md) *(si existe)*
- [`CURRENT_STATE.md`](CURRENT_STATE.md)
- [`decisions/`](decisions/) — todos los ADRs.
