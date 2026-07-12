# BACKUP ARCHITECTURE

Fecha: 2026-07-12
Referencia: ADR-020

## Componentes

```
scripts/backup/
  crypto.ts               Cifrado/descifrado AES-256-GCM, checksums SHA-256
  manifest.ts             Manifiesto de backup con metadatos y checksums
  postgres-backup.ts      pg_dump + SHA-256 + cifrado + manifiesto
  postgres-restore.ts     Descifrado + checksum + restore aislado + verificacion
  minio-backup.ts         Descarga objetos + tar + cifrado + manifiesto
  minio-restore.ts        Descifrado + checksum + restore aislado + verificacion
  config-backup.ts        Bundle JSON de configuracion + cifrado
  verify-backup.ts        Verificacion de integridad sin restaurar
  backup-all.ts           Punto de entrada para backups selectivos o completos
  disaster-recovery-drill.ts  Drill completo: backup + verify + restore + cleanup
  backup.test.ts          21 tests unitarios + invariantes de seguridad
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
pg_dump → .sql → SHA-256 → encrypt → .sql.enc → manifiesto → eliminar .sql
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
| `pnpm backup:drill` | Drill completo: backup + verify + restore + cleanup |

## Variables de entorno

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | Si | Clave AES-256-GCM (64 hex chars = 32 bytes) |
| `DATABASE_URL` | Si (via .env.local) | PostgreSQL connection string |
| `MINIO_ENDPOINT` | Si (via .env.local) | Endpoint MinIO |
| `MINIO_ACCESS_KEY` | Si (via .env.local) | MinIO access key |
| `MINIO_SECRET_KEY` | Si (via .env.local) | MinIO secret key |
| `MINIO_BUCKET` | Si (via .env.local) | Bucket principal |

## Seguridad

- Dumps sin cifrar se eliminan inmediatamente despues de cifrar
- Configuracion excluye `.env.local`, `.env.production`, archivos con "credentials"/"secret"
- Restauracion siempre a destinos aislados: `nci_logistics_restore_test` (DB), `nci-logistics-restore-test` (bucket)
- `/backups/` en `.gitignore`
- Checksums SHA-256 verificados antes de restaurar
- AuthTag GCM detecta cualquier tampereo del ciphertext
