# ADR-036: Entorno de staging en la nube (GitHub, Supabase, Vercel, ClamAV en Fly.io)

Estado: Aceptado
Fecha: 2026-11-12
Reemplaza parcialmente: ADR-002 (infraestructura local) para el entorno de staging.

## Contexto

Hasta ahora la regla del proyecto era operar sin servicios cloud en el flujo principal y
sin remotes de git (ADR-002, `AGENTS.md`). El 2026-11-12 el dueño del proyecto autorizó en
chat un entorno de **staging en la nube para pruebas reales** con usuarios. Decisiones
tomadas por el dueño:

- Repositorio **público** en GitHub.
- Supabase para Postgres y Storage: proyecto nuevo `nci-lct-staging`, región `us-east-1`,
  costo aprobado de US$10/mes.
- Vercel (team "Web Studio") para la app Next.js.
- ClamAV en un contenedor aparte en Fly.io (Vercel no puede ejecutar clamd).

## Decisión

### Perfiles de entorno (`APP_ENV`)

`src/lib/app-env.ts` define `local | staging | production` y **falla cerrado** (revisión de
producción, 2026-11-13). El valor por defecto ya no puede ser el permisivo:

- `APP_ENV` definido: debe ser exactamente `local`, `staging` o `production`. Cualquier otro
  valor (`prod`, `Production`) lanza un error en la build, el arranque o el seed.
- `APP_ENV` sin definir: `NODE_ENV=production` (siempre el caso en Vercel y en `next build`)
  resuelve a `production`; solo el desarrollo y las pruebas resuelven a `local`.
- Una build local de producción necesita `APP_ENV=local` explícito (el `.env.example` lo trae).

- **Local** conserva ADR-002 sin cambios: Docker con Postgres, MinIO, Mailpit y ClamAV.
- **Fuera de local:**
  - no se muestran credenciales demo (landing y login);
  - el storage no acepta las claves por defecto de MinIO;
  - `keyedHash` exige `SESSION_METADATA_KEY` (antes caía a un SHA-256 sin clave);
  - las acciones demo (`demo-actions.ts`) se niegan a correr;
  - el seed exige `SEED_PASSWORD` y `SEED_TOTP_SECRET` propios.
  - Motivo: el repositorio es público, así que las contraseñas demo y el TOTP del seed
    son conocidos por cualquiera.
- **`production`** existe como perfil, pero usarlo con clientes reales sigue requiriendo
  aprobación aparte (ver "Camino a producción").

### Guardas de destino de la base de datos

Los scripts que escriben comparten `scripts/lib/db-target.ts`:

- `db:seed`, `demo:seed`, `demo:reset` y `demo:status` imprimen el destino (host, puerto y
  base; nunca la contraseña) y se niegan a correr con el perfil `local` contra un host que no
  sea local, salvo `ALLOW_REMOTE_SEED=true`. El flujo de staging (`APP_ENV=staging` con
  `SEED_PASSWORD` y `SEED_TOTP_SECRET`) no cambia.
- `db:reset` (borra la base) se niega con cualquier host remoto y con `production`.
- `db:deploy`, `prod:bootstrap` y `demo:purge` exigen `CONFIRM_DB_HOST` igual al host si la
  base no es local.

### Datos: Supabase Postgres

- La app y las migraciones usan un rol propio, `nci_app`, con contraseña propia:
  - no es superusuario, no crea bases ni roles;
  - tiene `CREATE` sobre la base y el esquema `public`;
  - es dueño de las tablas.
- Desde Vercel se conecta al pooler de Supabase en modo transacción
  (`aws-1-us-east-1.pooler.supabase.com:6543`, `pgbouncer=true`).
- Las migraciones se aplican por el pooler en modo sesión (puerto 5432) desde un equipo
  autorizado, con `pnpm db:deploy` (envuelve `prisma migrate deploy` y rechaza el pooler
  transaccional). No se agrega `directUrl` al schema.
- La app no usa la Data API (PostgREST) de Supabase. `infra/supabase/harden.sql`:
  - activa RLS en todas las tablas, sin políticas;
  - revoca todo a `anon` y `authenticated`.
  - `nci_app` es dueño, sin `FORCE`, así que no queda sujeto a RLS.
- Hay que re-ejecutar el script tras cada migración.
- Orden obligatorio (cada push a `main` despliega solo): migrar **antes** de fusionar el código
  que la necesita, con migraciones aditivas y compatibles hacia atrás durante un release. El
  rollback es redesplegar el deployment anterior de Vercel y, si se tocaron datos, restaurar el
  backup. Detalle en `docs/STAGING_DEPLOYMENT.md`.
- Los scripts y `prisma.config.ts` ya no pisan las variables exportadas con
  `.env.local`. Antes `override: true` hacía que un `DATABASE_URL` explícito apuntara en
  silencio a la DB local. `pnpm e2e:cleanup` se niega a correr contra hosts no locales.

### Archivos: Supabase Storage por S3

- `storage.ts` ya hablaba S3 con path-style.
- Se agrega `STORAGE_REGION` y se apunta `MINIO_ENDPOINT` al endpoint S3 de Supabase.
- El bucket es privado; las descargas siguen pasando por la API de la app, que verifica
  tenant y permisos.

### Antivirus: gateway HTTPS sobre clamd (`infra/clamav-gateway`)

- Exponer clamd por TCP a internet sería un servicio sin autenticación.
- El gateway (Node, en la misma máquina que clamd) expone:
  - `/scan` y `/health`, con token Bearer comparado en tiempo constante;
  - `/livez`, sin datos, para el health check de Fly.
- Límite de 6 MB.
- La app usa `HttpAntivirusProvider` cuando existe `ANTIVIRUS_URL`, y falla cerrado ante
  cualquier error: sin veredicto, el archivo queda en cuarentena.
- Verificado en Docker local:
  - 401 sin token;
  - `CLEAN` con un archivo limpio;
  - `INFECTED` con EICAR;
  - 413 con 7 MB;
  - primer arranque de unos 5 minutos por la descarga de firmas.
- En Fly corre una máquina siempre encendida, con 2 GB de RAM.

### Prisma en Vercel

`binaryTargets = ["native", "rhel-openssl-3.0.x"]` incluye el engine del runtime de Vercel.

### Repositorio público

- Se revisó el historial completo (113 commits) buscando patrones de credenciales. Solo
  apareció el placeholder `sk-your-key-here` del `.env.example`.
- `.env*` está ignorado salvo `.env.example`.

### Camino a producción (bootstrap y datos demo)

Ninguna migración inserta los planes de tenant, y el único camino para crear un
`PLATFORM_SUPER_ADMIN` era el seed demo (cuentas `.local` con una contraseña y un TOTP
compartidos y publicados en el repositorio).

- Los planes viven en `prisma/plans.ts`, compartido por el seed y por `pnpm prod:bootstrap`, que
  además crea el primer administrador de plataforma con un correo real y una contraseña propia
  (`BOOTSTRAP_ADMIN_*`). No pisa usuarios ni planes existentes. El MFA se enrola en el primer
  ingreso (`requirePlatformRole` redirige a `/account/security/mfa/setup`).
- `pnpm demo:purge` retira los tenants `isDemo` y las cuentas `.local` antes de operar con
  clientes reales: dry-run por defecto, `--apply` para ejecutar.
- La base de staging no se promueve a producción: producción usa un proyecto Supabase nuevo.

### Backups

Los scripts de `scripts/backup/` también funcionan contra Postgres remoto (Supabase): con
`BACKUP_DATABASE_URL` el dump sale de esa base con `pg_dump` local o, si no existe, con
`docker run postgres:17-alpine`, y la URL solo viaja por variables de entorno. El backup lógico
cifrado es el respaldo portable; los backups gestionados de Supabase dependen del plan (ver
`docs/BACKUP_ARCHITECTURE.md`).

## Alternativas descartadas

- **Staging sin antivirus, o con archivos "no escaneados" aceptados:** debilita un control
  de seguridad (ADR-011, ADR-014) que también protege a los clientes del portal.
- **clamd expuesto por TCP con TLS de Fly:** sin autenticación, cualquiera podría usarlo.
- **Reemplazar Prisma por el cliente de Supabase:** reescritura sin beneficio; el
  aislamiento multitenant ya se impone en servidor.
- **`directUrl` en el schema:** obliga a definir otra variable en local y en CI para
  algo que solo necesita quien migra.
- **Migrar en el build de Vercel:** una migración que falla a medias dejaría un deployment roto,
  y los previews migrarían la base compartida. La compuerta es manual y ordenada.
- **Reutilizar la base de staging como producción:** arrastra los tenants demo y las ocho
  cuentas con credenciales compartidas.
- **Un `APP_ENV` por defecto `local`:** un typo o una variable ausente en Vercel publicaba las
  credenciales demo en la landing prerenderizada. Ahora falla cerrado.

## Consecuencias

- `AGENTS.md` permite push a `origin` y los servicios de este ADR solo para staging.
  Producción real y cualquier costo nuevo siguen requiriendo aprobación explícita.
- Los secretos de staging viven en Vercel, en Fly (`fly secrets`) y en un archivo local
  ignorado por git. Nunca en el repo.
- El correo de staging necesita un SMTP real. Elegir proveedor es una integración real y
  requiere aprobación (pendiente).
- Condiciones para revisar este ADR:
  - activar `production` con clientes reales;
  - que el costo de Fly o Supabase cambie;
  - que se adopte la Data API de Supabase.
