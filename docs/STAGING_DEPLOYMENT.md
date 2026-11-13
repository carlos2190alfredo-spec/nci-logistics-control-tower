# Staging en la nube — runbook (ADR-036)

Entorno para pruebas reales. **No es producción.** Los secretos nunca van al repositorio,
que es público. Las secciones "Orden de migraciones" y "Salida a producción" describen el
camino a producción; no lo habilitan: producción real sigue requiriendo aprobación del dueño.

## Componentes

| Componente | Servicio | Identificador |
| --- | --- | --- |
| App Next.js | Vercel, team "Web Studio" (`web-studio-hq`), región `iad1` | proyecto `nci-logistics-control-tower` → **https://nci-logistics-control-tower.vercel.app** |
| Postgres | Supabase `nci-lct-staging` (ref `khedaunvwzjduxmlufun`), us-east-1 | rol de app `nci_app` |
| Archivos | Supabase Storage por S3, bucket privado `nci-lct-staging` | endpoint `https://khedaunvwzjduxmlufun.storage.supabase.co/storage/v1/s3` |
| Antivirus | Fly.io, app `nci-lct-clamav-staging` (`infra/clamav-gateway`) | `https://nci-lct-clamav-staging.fly.dev` |
| Correo | SMTP real (Resend, dominio `nciautomation.com`) | pendiente la API key (`MAIL_PASSWORD`) |
| Mantenimiento diario | Vercel Cron (`vercel.json` → `/api/internal/cron/maintenance`, 09:00 UTC) | requiere `CRON_SECRET` |

## Estado (2026-11-13)

| Pieza | Estado |
| --- | --- |
| GitHub `carlos2190alfredo-spec/nci-logistics-control-tower` | Publicado (`main`). Cada push a `main` despliega en Vercel |
| Vercel | Desplegado desde `main`. **Health 200 HEALTHY** (2026-11-13): Postgres, Prisma, storage (HeadBucket con la clave S3) y el gateway de ClamAV responden |
| Supabase | Migrado, endurecido, sembrado; bucket creado |
| Storage S3 | Configurado: clave `vercel-nci-lct-staging` (Supabase → Storage → S3 Connection, acceso total a los buckets; solo la usa el servidor). `MINIO_ACCESS_KEY` y `MINIO_SECRET_KEY` en Vercel (Sensitive, Production y Preview). El secreto lo pegó el dueño: las herramientas de navegador bloquean leerlo y no se teclean credenciales. Rotar = crear otra clave, cargarla y borrar la anterior |
| Perfil | `APP_ENV=production` solo en el entorno Production de Vercel (sitio indexable: `robots.txt` y sitemap verificados); Preview conserva `APP_ENV=staging` (noindex) |
| Correo | Configurado: `MAIL_PASSWORD` es una API key de Resend solo de envío, restringida al dominio `nciautomation.com` (creada y cargada en Vercel el 2026-11-13). Credenciales y TLS verificados contra `smtp.resend.com:465` sin enviar correo. Falta probar un envío real de la app |
| Cron de mantenimiento | `CRON_SECRET` cargada solo en Production. Verificado: 401 sin token o con token incorrecto y 200 con el token (rescan 0, prune 0, health evaluado y alerta registrada). `OPS_ALERT_EMAIL` sin definir: las alertas solo quedan en `operational_alerts` |
| ClamAV en Fly | Desplegado: app `nci-lct-clamav-staging`, 1 máquina en iad, check pasando. Verificado desde internet: 401 sin token o con token incorrecto, `CLEAN`, `INFECTED` (EICAR), 413 con 7 MB |

## Secretos

- Se generan en local en `.env.staging.local` (modo 600 e ignorado por `.env*`):
  - `STAGING_DB_PASSWORD`, `SEED_PASSWORD`, `SEED_TOTP_SECRET`, `ANTIVIRUS_TOKEN`;
  - `SESSION_SECRET`, `SESSION_METADATA_KEY`, `MFA_ENCRYPTION_KEY`,
    `INTEGRATION_ENCRYPTION_KEY`;
  - `CRON_SECRET` (`openssl rand -hex 32`; el endpoint exige al menos 16 caracteres).
- `MFA_ENCRYPTION_KEY` debe ser **el mismo** en el seed y en Vercel. Si cambia, los
  secretos TOTP sembrados no se pueden descifrar.
- `SESSION_METADATA_KEY` es obligatoria fuera de `local` (al menos 32 caracteres; use
  `openssl rand -hex 32`). Sin ella `keyedHash` lanza en vez de usar un SHA-256 sin clave.
  `pnpm app:doctor` y `pnpm readiness:check` la verifican.
- `BACKUP_ENCRYPTION_KEY` (cifra los backups) vive solo en el equipo autorizado y en una
  copia física aparte. Si se pierde, los backups cifrados con ella son irrecuperables.
  No va a Vercel.

## Perfil de entorno (`APP_ENV`)

`src/lib/app-env.ts` falla cerrado: el valor por defecto no puede ser el permisivo.

| `APP_ENV` | `NODE_ENV` | Resultado |
| --- | --- | --- |
| `local`, `staging` o `production` (exacto) | cualquiera | ese perfil |
| sin definir o vacío | `production` (Vercel, `next build`, `next start`) | `production` |
| sin definir o vacío | `development` o `test` | `local` |
| cualquier otro valor (`prod`, `Production`, ` staging`) | cualquiera | **lanza un error**; la build y el seed fallan |

- Solo `local` muestra credenciales demo en la landing y el login, y acepta las claves
  por defecto de MinIO.
- La landing se prerenderiza en la build: un `APP_ENV` inválido rompe el despliegue en
  vez de publicar credenciales demo.
- Una build local de producción (`pnpm build && pnpm start`, perfil Docker `app`) necesita
  `APP_ENV=local` en `.env.local` (el `.env.example` ya lo trae).
- Fije siempre `APP_ENV` explícito en Vercel; el valor por defecto de `production` es solo
  una red de seguridad.

## Variables en Vercel (Production + Preview)

Obligatorias:

| Variable | Valor |
| --- | --- |
| `APP_ENV` | `staging` (o `production`, ver "Salida a producción") |
| `DATABASE_URL` | `postgresql://nci_app.khedaunvwzjduxmlufun:<STAGING_DB_PASSWORD>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require` |
| `NEXT_PUBLIC_APP_URL`, `APP_URL`, `ALLOWED_ORIGINS` | URL pública de Vercel (`ALLOWED_ORIGINS` puede ser una lista separada por comas) |
| `SESSION_SECRET` | 64 hex, de `.env.staging.local` |
| `SESSION_METADATA_KEY` | 32 caracteres o más (64 hex), de `.env.staging.local`. Obligatoria fuera de local |
| `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY` | 64 hex cada una, de `.env.staging.local` |
| `MINIO_ENDPOINT` | endpoint S3 de Supabase (tabla de componentes) |
| `STORAGE_REGION` | `us-east-1` |
| `MINIO_BUCKET` | `nci-lct-staging` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | clave S3 creada en Supabase → Storage → S3 Connection |
| `ANTIVIRUS_URL`, `ANTIVIRUS_TOKEN` | URL de Fly + token (el mismo en `fly secrets`) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP aprobado. Resend: `smtp.resend.com`, `465` (TLS implícito; con `587` se exige STARTTLS), `resend`, la API key de envío y un remitente de un dominio verificado. Fuera de local no hay valores por defecto: sin `MAIL_HOST` o `MAIL_FROM` el correo falla con un error de configuración, y `MAIL_USER` y `MAIL_PASSWORD` se definen juntos |
| `CRON_SECRET` | `openssl rand -hex 32` (mínimo 16 caracteres). Vercel Cron la envía como `Authorization: Bearer` al llamar `/api/internal/cron/maintenance`; sin ella el endpoint responde 503 y con una incorrecta, 401. Los crons solo corren en el entorno Production |

Opcionales:

| Variable | Valor |
| --- | --- |
| `MAIL_SECURE` | `true` fuerza TLS implícito; con puerto `465` ya se activa solo |
| `SESSION_COOKIE_NAME` | nombre de la cookie (por defecto `nci_lct_session`) |
| `AI_PROVIDER` | `disabled` hasta que se apruebe un proveedor de IA (con `auto` y sin clave usa reglas) |
| `DEEPSEEK_API_KEY` y `DEEPSEEK_*` | solo si se aprueba DeepSeek (`docs/DEEPSEEK_SETUP.md`) |
| `GOOGLE_MAPS_ROUTES_MODE`, `GOOGLE_MAPS_API_KEY` | `disabled` por defecto; la clave solo con modo `google` |
| `COMMIT_SHA` | SHA que aparece en health y métricas (por defecto `local`) |

**No** van en Vercel (solo en el equipo autorizado, y se retiran al terminar):
`SEED_PASSWORD`, `SEED_TOTP_SECRET`, `ALLOW_PROD_SEED`, `ALLOW_REMOTE_SEED`,
`BOOTSTRAP_ADMIN_*`, `CONFIRM_DB_HOST`, `BACKUP_*`, `RESTORE_DATABASE_URL`,
`DEMO_TENANT_PASSWORD`.

## Migraciones (desde un equipo autorizado)

```bash
set -a; . ./.env.staging.local; set +a
export DATABASE_URL="postgresql://nci_app.khedaunvwzjduxmlufun:${STAGING_DB_PASSWORD}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

export CONFIRM_DB_HOST=aws-1-us-east-1.pooler.supabase.com

pnpm db:deploy --status      # solo informa las migraciones pendientes
pnpm db:deploy               # aplica
```

- `pnpm db:deploy` imprime el destino (host, puerto y base; nunca usuario ni contraseña) y
  se niega a correr contra un host que no es local si `CONFIRM_DB_HOST` no es igual al host.
- Se niega a migrar por el pooler en modo transacción (puerto 6543 o `pgbouncer=true`):
  use siempre la conexión de sesión del puerto 5432.
- Equivale a `pnpm exec prisma migrate deploy`; la guarda es lo único que añade.

Después de cada migración, ejecutar `infra/supabase/harden.sql` en el SQL editor de
Supabase. Es idempotente: activa RLS y revoca el acceso de la Data API.

## Orden de migraciones y despliegue (compuerta)

Cada push a `main` despliega en Vercel, y las migraciones se aplican a mano. Nada impide
que el código llegue antes que su migración, así que el orden lo impone este runbook:

1. **Backup**: confirmar un backup reciente de la base (ver `docs/BACKUP_ARCHITECTURE.md`):
   `pnpm backup:postgres` con `BACKUP_DATABASE_URL`, más `pnpm backup:verify <dir>`.
2. **Migrar primero**: `pnpm db:deploy` contra la base destino y re-ejecutar `harden.sql`.
3. **Comprobar**: `pnpm db:deploy --status` no debe listar migraciones pendientes.
4. **Fusionar después**: solo entonces se fusiona o se hace push del código que la necesita.
   Nunca al revés: el código nuevo contra un esquema viejo falla en cada consulta que toca
   la columna o tabla nueva.

Las migraciones deben ser **aditivas y compatibles hacia atrás durante un release**
(expandir y contraer): el código anterior sigue funcionando con el esquema nuevo.

- En el release que migra: solo tablas, columnas anulables o con valor por defecto, e índices.
- Prohibido en ese mismo release: `DROP`, `RENAME`, cambiar el tipo de una columna usada, o
  `NOT NULL` sin valor por defecto.
- Lo destructivo va en un release posterior, cuando ningún código en producción ya lee lo viejo.

**Rollback.** Prisma no tiene migraciones inversas.

- El código se revierte redesplegando el deployment anterior de Vercel (Dashboard →
  Deployments → el deployment bueno → "Instant Rollback"). Es seguro porque la migración era
  aditiva y el código viejo ignora lo nuevo.
- Si la migración tocó datos o fue destructiva, además hay que restaurar desde el backup del
  paso 1 (procedimiento y drill en `docs/BACKUP_ARCHITECTURE.md`). No se "deshace" volviendo a
  ejecutar `db:deploy`.
- Si `main` sigue desplegando solo, el rollback se pierde con el siguiente push: pause el
  despliegue automático o revierta el commit en `main`.

Pendiente (no es código de este runbook): un check de readiness que compare
`_prisma_migrations` con las migraciones del build, y desactivar el despliegue automático de
producción (o exigir aprobación) antes del primer cliente real. Hasta entonces la compuerta
es este procedimiento y `pnpm db:deploy --status`.

## Seed de staging

```bash
set -a; . ./.env.staging.local; set +a
APP_ENV=staging DATABASE_URL="<conexión de sesión de arriba>" pnpm db:seed
```

- Con `APP_ENV=staging` el seed exige `SEED_PASSWORD` y `SEED_TOTP_SECRET`.
- Todas las cuentas demo usan esa contraseña. Las cuentas con MFA (plataforma y owners)
  usan ese secreto TOTP, que hay que cargar en una app autenticadora.
- El seed imprime el destino (`host:puerto/base`, sin credenciales) antes de escribir.
- Con el perfil `local` el seed, `pnpm demo:seed`, `pnpm demo:reset` y `pnpm demo:status` se
  niegan a correr contra un host que no sea local (`localhost`, `127.0.0.1`, `[::1]`,
  `postgres`): publicarían las credenciales demo del repositorio. `ALLOW_REMOTE_SEED=true`
  lo permite; no lo use para staging, para eso existe `APP_ENV=staging`.
- `pnpm db:reset` borra la base completa: se niega a correr contra cualquier host remoto, en
  cualquier perfil, y nunca en `production`.

## Salida a producción

Nada de esto se ejecuta sin aprobación explícita del dueño.

### 1. Base de datos de producción

- Preferible: un proyecto Supabase **nuevo** para producción. No reutilice la base de staging:
  contiene los tenants demo y las ocho cuentas que comparten una contraseña y un TOTP
  (ver "Datos demo" más abajo).
- Aplique las migraciones con `pnpm db:deploy` y `harden.sql` (con la conexión de sesión).
- **No** ejecute `pnpm db:seed`: con `APP_ENV=production` se bloquea salvo `ALLOW_PROD_SEED=true`,
  y crearía los tenants demo.
- Defina en Vercel todas las variables de la tabla anterior con valores **propios de
  producción**: secretos nuevos (`SESSION_SECRET`, `SESSION_METADATA_KEY`, `MFA_ENCRYPTION_KEY`,
  `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `ANTIVIRUS_TOKEN`), bucket y claves S3 propios, y
  `APP_ENV=production`.

### 2. Bootstrap: planes y primer administrador

Ninguna migración inserta los planes de tenant (`DEMO`, `STARTER`, `PROFESSIONAL`, `ENTERPRISE`):
sin ellos la UI no puede crear tenants. Tampoco existe otro camino para crear el primer
`PLATFORM_SUPER_ADMIN` que el seed demo. `pnpm prod:bootstrap` hace ambas cosas:

```bash
set -a; . ./.env.production.local; set +a      # solo DATABASE_URL (conexión de sesión), no se versiona
export CONFIRM_DB_HOST="<host de DATABASE_URL>"
export BOOTSTRAP_ADMIN_EMAIL="operaciones@su-dominio.com"   # buzón real
export BOOTSTRAP_ADMIN_NAME="Nombre Apellido"
export BOOTSTRAP_ADMIN_PASSWORD="<mínimo 16 caracteres, único>"
pnpm prod:bootstrap
unset BOOTSTRAP_ADMIN_PASSWORD
```

- Hace upsert de los planes desde `prisma/plans.ts` (la misma definición que usa el seed) y no
  modifica los planes que ya existen: solo avisa si difieren.
- Crea el `PLATFORM_SUPER_ADMIN` con el correo y la contraseña indicados. Rechaza correos
  `.local`, `.test`, `.invalid`, `example.*`, contraseñas de menos de 16 caracteres y las
  contraseñas demo del repositorio. Nunca imprime la contraseña.
- Es idempotente y **nunca pisa** la contraseña ni el rol de un usuario que ya existe.
- Exige `CONFIRM_DB_HOST` igual al host si la base no es local, e imprime el destino.
- **MFA**: el script no crea un secreto TOTP. La app lo exige en el primer ingreso: el login
  abre una sesión solo con contraseña y lleva a `/platform`, y `requirePlatformRole`
  (`src/lib/server/auth.ts`) redirige a `/account/security/mfa/setup` hasta que haya un secreto
  TOTP verificado. Escanee el QR con una app autenticadora y guarde los códigos de recuperación.
- Con el administrador ya autenticado y con MFA, los tenants reales se crean desde `/platform/tenants` (los planes ya existen).

### 3. Datos demo (antes de cualquier cliente real)

El seed de staging dejó en la base:

| Qué | Detalle |
| --- | --- |
| Tenants demo | `panatruck-demo` y `translogistica-demo` (`isDemo = true`) |
| Ocho usuarios | `platform@nci.local`, `owner@panatruck.local`, `operaciones@panatruck.local`, `despacho@panatruck.local`, `conductor1@panatruck.local`, `cliente@clienteportuario.local`, `owner@translogistica.local`, `cliente@distribuciones.local` |
| Una contraseña | todos usan `SEED_PASSWORD` |
| Un TOTP | las tres cuentas con MFA (plataforma y owners) usan `SEED_TOTP_SECRET` |

El correo de la cuenta de plataforma es público (README) y todas son direcciones `.local`, que no
reciben correo de recuperación. Quien tenga `SEED_PASSWORD` y el secreto TOTP entra como
super administrador. Si esta base se va a usar con clientes reales, hay que retirarlas:

```bash
set -a; . ./.env.staging.local; set +a
export DATABASE_URL="<conexión de sesión de la base>"
export CONFIRM_DB_HOST="<host de DATABASE_URL>"

# 0. Cree antes el administrador real (sección 2) y compruebe que entra con su MFA.
pnpm demo:purge                # dry-run: lista tenants, usuarios y objetos; no borra nada
pnpm demo:purge --apply        # ejecuta
```

`pnpm demo:purge`:

- borra solo los tenants con `isDemo = true` (y lo que cuelga de ellos) y los usuarios cuyo
  correo termina en `.local` que no pertenecen a ningún tenant real;
- no toca usuarios con correo real: los que solo pertenecen a tenants demo se listan para
  revisión manual;
- un usuario `.local` que no se pueda borrar (tiene feedback o invitaciones en un tenant real)
  se desactiva y se revocan sus sesiones;
- con `--apply` se niega a correr si, al terminar, no quedaría un `PLATFORM_SUPER_ADMIN`
  activo que no sea demo;
- borra del bucket los archivos de los tenants demo si `MINIO_*` están en el entorno (si no,
  informa cuántos quedan para borrarlos desde Supabase Storage);
- exige `CONFIRM_DB_HOST` igual al host, también en dry-run, y registra un `demo.purge` en
  `audit_logs`.

Después de la purga:

- retire `SEED_PASSWORD` y `SEED_TOTP_SECRET` de `.env.staging.local`, de Vercel y de cualquier
  gestor de secretos, y retire la entrada de la app autenticadora;
- no vuelva a ejecutar `pnpm db:seed` contra esa base;
- si no se ejecuta el script, el mínimo es suspender los tenants demo (acción de plataforma
  `changeTenantStatusAction`), poner `active = false` a las ocho cuentas y rotar esos secretos.

### 4. Lista de verificación de salida

- [ ] `APP_ENV=production` explícito en Vercel y todas las variables obligatorias definidas.
- [ ] Base nueva (o purgada), migrada, con `harden.sql`, sin migraciones pendientes.
- [ ] `pnpm prod:bootstrap` ejecutado; el administrador real entra y completó su MFA.
- [ ] `pnpm demo:purge` en dry-run no lista nada; `SEED_*` retirados de todas partes.
- [ ] `GET /api/internal/health` → `HEALTHY`; landing y login sin credenciales demo.
- [ ] Backup cifrado reciente verificado y un drill de restore hecho (`docs/BACKUP_ARCHITECTURE.md`);
      plan y nivel de backup de Supabase anotados.
- [ ] El cron responde: `curl -H "Authorization: Bearer $CRON_SECRET" <URL>/api/internal/cron/maintenance` → 200
      y, sin el encabezado, 401.
- [ ] SMTP real probado con un correo de recuperación de contraseña.
- [ ] Despliegue automático de `main` pausado o con aprobación (ver "Orden de migraciones").

## ClamAV en Fly.io

```bash
cd infra/clamav-gateway
fly apps create nci-lct-clamav-staging --org personal        # hecho 2026-11-13
fly secrets set GATEWAY_TOKEN="<ANTIVIRUS_TOKEN>" -a nci-lct-clamav-staging --stage
fly deploy -a nci-lct-clamav-staging --remote-only --ha=false
curl -s https://nci-lct-clamav-staging.fly.dev/livez   # 200 cuando clamd cargó firmas (~5 min)
```

## Redesplegar Vercel tras cambiar variables

Cada push a `main` despliega. Sin cambios de código:

```bash
git commit --allow-empty -m "chore: redeploy staging" && git push origin main
```

Un cambio de variables solo aplica al siguiente deployment. `APP_ENV` y `NODE_ENV` se leen
también en la build (la landing se prerenderiza), así que cambiar `APP_ENV` exige redesplegar.

## Verificación tras desplegar

1. `GET /api/internal/health` → `{"status":"HEALTHY"}`.
2. La landing y el login no muestran credenciales demo.
3. Una contraseña demo del repo (`Cliente2026!`) es rechazada.
4. Login con `SEED_PASSWORD` + TOTP del owner funciona (solo staging con seed).
5. La evidencia de un viaje sube, pasa por ClamAV y queda `AVAILABLE`.
6. El aislamiento entre tenants se mantiene: un usuario de TransLogistica no ve
   documentos de Panatruck.
7. `GET /api/internal/cron/maintenance` sin encabezado → 401; con `Authorization: Bearer <CRON_SECRET>` → 200.
