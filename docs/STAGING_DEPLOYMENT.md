# Staging en la nube — runbook (ADR-036)

Entorno para pruebas reales. **No es producción.** Los secretos nunca van al repositorio,
que es público.

## Componentes

| Componente | Servicio | Identificador |
| --- | --- | --- |
| App Next.js | Vercel, team "Web Studio" (`web-studio-hq`), región `iad1` | proyecto `nci-logistics-control-tower` → **https://nci-logistics-control-tower.vercel.app** |
| Postgres | Supabase `nci-lct-staging` (ref `khedaunvwzjduxmlufun`), us-east-1 | rol de app `nci_app` |
| Archivos | Supabase Storage por S3, bucket privado `nci-lct-staging` | endpoint `https://khedaunvwzjduxmlufun.storage.supabase.co/storage/v1/s3` |
| Antivirus | Fly.io, app `nci-lct-clamav-staging` (`infra/clamav-gateway`) | `https://nci-lct-clamav-staging.fly.dev` |
| Correo | SMTP real (pendiente de aprobación del proveedor) | — |

## Estado (2026-11-13)

| Pieza | Estado |
| --- | --- |
| GitHub `carlos2190alfredo-spec/nci-logistics-control-tower` | Publicado (`main`). Cada push a `main` despliega en Vercel |
| Vercel | Desplegado (READY). Postgres y Prisma sanos en runtime; health `UNHEALTHY` solo por `storage` y `clamav` |
| Supabase | Migrado, endurecido, sembrado; bucket creado |
| Storage S3 | **Falta** `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` (Supabase → Storage → S3 Connection → New access key) |
| Correo | **Falta** `MAIL_PASSWORD` (API key de envío de Resend para `nciautomation.com`) |
| ClamAV en Fly | **Falta** `flyctl auth login` del dueño; luego `fly launch`/`secrets`/`deploy` |

## Secretos

- Se generan en local en `.env.staging.local` (modo 600 e ignorado por `.env*`):
  - `STAGING_DB_PASSWORD`, `SEED_PASSWORD`, `SEED_TOTP_SECRET`, `ANTIVIRUS_TOKEN`;
  - `SESSION_SECRET`, `SESSION_METADATA_KEY`, `MFA_ENCRYPTION_KEY`,
    `INTEGRATION_ENCRYPTION_KEY`.
- `MFA_ENCRYPTION_KEY` debe ser **el mismo** en el seed y en Vercel. Si cambia, los
  secretos TOTP sembrados no se pueden descifrar.

## Variables en Vercel (Production + Preview)

| Variable | Valor |
| --- | --- |
| `APP_ENV` | `staging` |
| `DATABASE_URL` | `postgresql://nci_app.khedaunvwzjduxmlufun:<STAGING_DB_PASSWORD>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require` |
| `NEXT_PUBLIC_APP_URL`, `APP_URL`, `ALLOWED_ORIGINS` | URL pública de Vercel |
| `SESSION_SECRET`, `SESSION_METADATA_KEY`, `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY` | de `.env.staging.local` |
| `MINIO_ENDPOINT` | endpoint S3 de Supabase (tabla de arriba) |
| `STORAGE_REGION` | `us-east-1` |
| `MINIO_BUCKET` | `nci-lct-staging` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | clave S3 creada en Supabase → Storage → S3 Connection |
| `ANTIVIRUS_URL`, `ANTIVIRUS_TOKEN` | URL de Fly + token (el mismo en `fly secrets`) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | proveedor SMTP aprobado |

## Migraciones (desde un equipo autorizado)

```bash
set -a; . ./.env.staging.local; set +a
DATABASE_URL="postgresql://nci_app.khedaunvwzjduxmlufun:${STAGING_DB_PASSWORD}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  pnpm exec prisma migrate deploy
```

Después de cada migración, ejecutar `infra/supabase/harden.sql` en el SQL editor de
Supabase. Es idempotente: activa RLS y revoca el acceso de la Data API.

## Seed de staging

```bash
set -a; . ./.env.staging.local; set +a
APP_ENV=staging DATABASE_URL="<conexión de sesión de arriba>" pnpm db:seed
```

- Con `APP_ENV=staging` el seed exige `SEED_PASSWORD` y `SEED_TOTP_SECRET`.
- Todas las cuentas demo usan esa contraseña. Las cuentas con MFA (plataforma y owners)
  usan ese secreto TOTP, que hay que cargar en una app autenticadora.

## ClamAV en Fly.io

```bash
cd infra/clamav-gateway
fly launch --no-deploy --copy-config --name nci-lct-clamav-staging
fly secrets set GATEWAY_TOKEN="<ANTIVIRUS_TOKEN>"
fly deploy
curl -s https://nci-lct-clamav-staging.fly.dev/livez   # 200 cuando clamd cargó firmas (~5 min)
```

## Verificación tras desplegar

1. `GET /api/internal/health` → `{"status":"HEALTHY"}`.
2. La landing y el login no muestran credenciales demo.
3. Una contraseña demo del repo (`Cliente2026!`) es rechazada.
4. Login con `SEED_PASSWORD` + TOTP del owner funciona.
5. La evidencia de un viaje sube, pasa por ClamAV y queda `AVAILABLE`.
6. El aislamiento entre tenants se mantiene: un usuario de TransLogistica no ve
   documentos de Panatruck.
