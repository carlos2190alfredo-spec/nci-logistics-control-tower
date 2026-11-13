# BACKUP ARCHITECTURE

Fecha: 2026-07-12 (actualizado 2026-11-13: Postgres remoto / Supabase)
Referencia: ADR-020, ADR-036

## Componentes

```
scripts/backup/
  crypto.ts               Cifrado/descifrado AES-256-GCM, checksums SHA-256
  manifest.ts             Manifiesto de backup con metadatos y checksums
  pg-tools.ts             pg_dump/psql locales o `docker run postgres:17-alpine`; la URL solo va por entorno
  postgres-backup.ts      pg_dump (Docker Compose o BACKUP_DATABASE_URL) + SHA-256 + cifrado + manifiesto
  postgres-restore.ts     Descifrado + checksum + restore aislado + verificacion (CLI: pnpm backup:restore:postgres)
  minio-backup.ts         Descarga objetos + tar + cifrado + manifiesto
  minio-restore.ts        Descifrado + checksum + restore aislado + verificacion
  config-backup.ts        Bundle JSON de configuracion + cifrado
  verify-backup.ts        Verificacion de integridad sin restaurar
  backup-all.ts           Punto de entrada para backups selectivos o completos
  disaster-recovery-drill.ts  Drill completo: backup + verify + restore + cleanup
  backup.test.ts          21 tests unitarios + invariantes de seguridad
  pg-tools.test.ts        17 tests: conexion, modo local/docker, la URL nunca en la linea de comandos
```

## Formato de archivo cifrado

```
Bytes 0-7:    Magic header "NCIBAK01"
Bytes 8-23:   IV (16 bytes, aleatorio)
Bytes 24..N:  Ciphertext (AES-256-GCM)
Bytes N+1..N+16: AuthTag (16 bytes)
```

La clave de cifrado proviene de `BACKUP_ENCRYPTION_KEY` (variable de entorno, 64 chars hex = 32 bytes).

## Flujo de backup

```
pg_dump (una sola vez) → .sql → SHA-256 → encrypt → .sql.enc → manifiesto → eliminar .sql
MinIO list → download all → .tar → SHA-256 → encrypt → .tar.enc → manifiesto → eliminar .tar
Config collect → .json → SHA-256 → encrypt → .json.enc → manifiesto → eliminar .json
```

## Flujo de restore

```
.enc → verify encrypted checksum → decrypt → verify original checksum → restore a DB/bucket aislado → verificar tablas/objetos → limpiar aislado
```

## Scripts disponibles

| Comando | Proposito |
|---|---|
| `pnpm backup:all` | Backup completo (PostgreSQL + MinIO + config) |
| `pnpm backup:postgres` | Solo PostgreSQL |
| `pnpm backup:minio` | Solo MinIO |
| `pnpm backup:config` | Solo configuracion |
| `pnpm backup:verify <dir>` | Verificar integridad de un backup existente |
| `pnpm backup:restore:postgres <dir>` | Restaurar la entrada postgres del manifiesto en una base aislada, verificarla y eliminarla |
| `pnpm backup:drill` | Drill completo: backup + verify + restore + cleanup |

## Variables de entorno

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | Si | Clave AES-256-GCM (64 hex chars = 32 bytes) |
| `BACKUP_DATABASE_URL` | Solo para Postgres remoto | URL de la base a respaldar (Supabase: conexion de **sesion**, puerto 5432). Sin ella el backup usa el contenedor `postgres` de Docker Compose. No se usa `DATABASE_URL` |
| `BACKUP_PG_TOOLS` | No | `local` o `docker`. Por defecto: binarios `pg_dump` y `psql` locales si existen; si no, `docker run postgres:17-alpine` |
| `RESTORE_DATABASE_URL` | No | Postgres **local y descartable** donde correr el restore (rol con permiso para crear bases). Se rechaza cualquier host remoto. Sin ella el restore usa Docker Compose |
| `MINIO_ENDPOINT` | Si (via .env.local) | Endpoint S3: MinIO local o el endpoint S3 de Supabase |
| `MINIO_ACCESS_KEY` | Si (via .env.local) | Access key |
| `MINIO_SECRET_KEY` | Si (via .env.local) | Secret key |
| `MINIO_BUCKET` | Si (via .env.local) | Bucket principal |
| `STORAGE_REGION` | No | Region S3 (por defecto `us-east-1`) |

## Staging y produccion en Supabase

### Que cubre Supabase y que no

- Los backups gestionados de Supabase **dependen del plan** del proyecto: el plan Free no los
  incluye, el plan Pro incluye copias diarias con retencion limitada y la recuperacion a un
  punto en el tiempo (PITR) es un complemento de pago. Los detalles vigentes estan en
  Dashboard → Database → Backups.
- **El repositorio no registra el plan ni el nivel de backup del proyecto `nci-lct-staging`.**
  Registrelo en este documento tras revisar el Dashboard; hasta entonces no se debe asumir
  que existe un backup gestionado.
- Los backups de la base **no incluyen** los objetos de Supabase Storage (evidencias, POD,
  adjuntos): se respaldan aparte con `pnpm backup:minio`.
- El respaldo portable y verificable es el **dump logico cifrado** de este documento.

### Dump logico cifrado de la base remota

Desde un equipo autorizado (nunca en CI publico ni en Vercel):

```bash
export BACKUP_ENCRYPTION_KEY="<64 hex; vive fuera del repo>"
export BACKUP_DATABASE_URL="postgresql://nci_app.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

pnpm backup:postgres
pnpm backup:verify backups/<directorio>
```

- Use la conexion de **sesion** (puerto 5432). El pooler transaccional (6543,
  `pgbouncer=true`) se rechaza: `pg_dump` no funciona detras de el.
- Con `pg_dump` local usa ese binario; si no, ejecuta `docker run --rm postgres:17-alpine pg_dump`.
  La URL **nunca** va en la linea de comandos ni en el log: se descompone en variables `PG*`
  del entorno del proceso (en Docker, `-e PGHOST` sin valor).
- Un `pg_dump` mas viejo que el servidor falla con `server version mismatch`: fuerce Docker con
  `BACKUP_PG_TOOLS=docker` (la imagen es la misma version mayor que `docker-compose.yml`).
- El dump se limita al esquema `public` (`--schema=public`): el rol de la app no lee los
  esquemas internos de Supabase. Incluye `_prisma_migrations`.
- No incluye roles, contrasenas ni privilegios (`--no-owner --no-privileges`): tras restaurar en
  un proyecto nuevo hay que volver a ejecutar `infra/supabase/harden.sql`.
- El manifiesto guarda host, base y esquema, **no** usuario ni contrasena (no va cifrado).
- Un dump o un cifrado fallido no deja el `.sql` en claro en disco.
- No hay planificador: el backup no corre solo. Programelo en el equipo autorizado (cron o
  tarea programada) segun `docs/BACKUP_RETENTION_POLICY.md`.

Archivos de Storage: `pnpm backup:minio` con `MINIO_ENDPOINT` (endpoint S3 de Supabase),
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` y `STORAGE_REGION` del entorno de
staging o produccion.

### Drill de restore en un Postgres local descartable

Un backup que no se ha restaurado no cuenta. El drill restaura el dump cifrado en una base
aislada de un Postgres **local**, la verifica y la elimina. Nunca toca Supabase.

```bash
# 1. Postgres descartable (no use uno con datos que le importen)
docker run -d --rm --name nci-restore-drill -e POSTGRES_PASSWORD=drill-local \
  -p 127.0.0.1:55432:5432 postgres:17-alpine

# 2. Backup remoto y verificacion de integridad (ver arriba)
pnpm backup:postgres
pnpm backup:verify backups/<directorio>

# 3. Restore aislado: crea nci_logistics_restore_test, carga el dump con ON_ERROR_STOP,
#    cuenta tablas, verifica tablas criticas y elimina la base
export RESTORE_DATABASE_URL="postgresql://postgres:drill-local@127.0.0.1:55432/postgres"
pnpm backup:restore:postgres backups/<directorio>

# 4. Limpieza
docker stop nci-restore-drill
```

Registre el resultado (fecha, duracion, tablas, filas de tablas criticas) en
`docs/BACKUP_RESTORE_DRILL_LATEST.md`. Sin `RESTORE_DATABASE_URL` el restore usa el contenedor
`postgres` de Docker Compose, como antes. Una tabla critica ausente se informa como `[WARN]`:
trate cualquier `[WARN]` en un drill real como fallo.

### Restauracion real en un proyecto Supabase nuevo

Solo ante un desastre y hacia un proyecto **vacio**: el dump usa `--clean --if-exists` y borra
las tablas que ya existan.

```bash
umask 077
BACKUP_ENCRYPTION_KEY="<clave>" pnpm exec tsx -e \
  "require('./scripts/backup/crypto').decryptFile('backups/<dir>/postgres-<stamp>.sql.enc','restore.sql')"

# Conectese con el rol que sera dueno de las tablas (nci_app), por la conexion de sesion
export PGHOST=<host> PGPORT=5432 PGUSER=<rol> PGPASSWORD=<password> PGDATABASE=postgres PGSSLMODE=require
psql -v ON_ERROR_STOP=1 -f restore.sql        # o: docker run --rm -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE postgres:17-alpine psql -v ON_ERROR_STOP=1 < restore.sql
shred -u restore.sql 2>/dev/null || rm -f restore.sql
```

Despues: ejecutar `infra/supabase/harden.sql`, apuntar `DATABASE_URL` de Vercel a la base nueva,
y comprobar con `pnpm db:deploy --status` que no hay migraciones pendientes.

## Seguridad

- Dumps sin cifrar se eliminan inmediatamente despues de cifrar
- Configuracion excluye `.env.local`, `.env.production`, archivos con "credentials"/"secret"
- Restauracion siempre a destinos aislados: `nci_logistics_restore_test` (DB), `nci-logistics-restore-test` (bucket)
- El restore de Postgres solo corre contra un Postgres local (Docker Compose o `RESTORE_DATABASE_URL` local), nunca contra la base remota
- La URL de conexion y la contrasena no se imprimen ni van en la linea de comandos; los errores de `pg_dump`/`psql` se redactan
- `/backups/` en `.gitignore`
- Checksums SHA-256 verificados antes de restaurar
- AuthTag GCM detecta cualquier tampereo del ciphertext
