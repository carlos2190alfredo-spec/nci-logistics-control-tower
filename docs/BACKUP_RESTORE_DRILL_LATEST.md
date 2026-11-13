# BACKUP RESTORE DRILL — Ultimo resultado

Fecha del drill: 2026-07-12T08:05:22Z
Resultado: **PASS**
Duracion total: 7.4 segundos

## Pasos ejecutados

| # | Paso | Resultado | Duracion | Detalle |
|---|---|---|---|---|
| 1 | Backup PostgreSQL | PASS | 1.2s | pg_dump 2205.8 KB → cifrado AES-256-GCM |
| 2 | Backup MinIO | PASS | 0.7s | 68 objetos → tar 617.5 KB → cifrado |
| 3 | Backup config | PASS | 0.0s | 8 archivos → JSON 272.6 KB → cifrado |
| 4 | Guardar manifiesto | PASS | 0.0s | 3 entradas |
| 5 | Verificar integridad | PASS | 0.0s | 3 archivos, checksums SHA-256 verificados |
| 6 | Restore PostgreSQL | PASS | 4.4s | 37 tablas restauradas a DB aislada |
| 7 | Restore MinIO | PASS | 1.0s | 68 objetos restaurados a bucket aislado |

## Datos verificados en restore

### PostgreSQL

| Tabla | Filas |
|---|---|
| users | 34 |
| tenants | 2 |
| sessions | 1002 |
| trips | 182 |
| service_requests | 64 |
| audit_logs | 2090 |

Total: 37 tablas restauradas en base de datos aislada `nci_logistics_restore_test`.

### MinIO

- 68 objetos restaurados en bucket aislado `nci-logistics-restore-test`
- Conteo verificado: 68/68 objetos coinciden con manifiesto

## Tamanos

| Metrica | Valor |
|---|---|
| Tamano original total | 3.0 MB |
| Tamano cifrado total | 3.0 MB |
| Entradas en manifiesto | 3 |

## Evidencia

Reporte JSON generado automaticamente en:
`backups/drill-2026-07-12_08-05-22/drill-report.json`

## Limpieza

- Base de datos `nci_logistics_restore_test` eliminada tras verificacion
- Bucket `nci-logistics-restore-test` vaciado tras verificacion
- Archivos descifrados temporales eliminados

---

# Verificacion del camino remoto (2026-11-13) — sintetica, no es un drill de Supabase

Se ejecuto el flujo nuevo de `BACKUP_DATABASE_URL` / `RESTORE_DATABASE_URL` contra un Postgres 17
descartable y **sintetico** (contenedor `postgres:17-alpine` local, 6 tablas de prueba con
datos, una de ellas con RLS y un esquema extra para comprobar `--schema=public`). **No** se
toco Supabase ni ninguna base real, y el contenido no es el de la aplicacion.

| Paso | Resultado |
|---|---|
| `pg_dump` por `docker run` (sin binarios locales), URL solo por entorno | PASS |
| Cifrado, manifiesto sin usuario ni contrasena, `verify-backup` | PASS |
| Restore con `ON_ERROR_STOP` en `nci_logistics_restore_test` | PASS: 6 tablas, filas de las tablas criticas presentes |
| `pnpm backup:postgres` + `backup:verify` + `backup:restore:postgres` por CLI | PASS |
| Contrasena incorrecta | falla con el error de `pg_dump`, sin la contrasena, y sin `.sql` en claro en disco |
| Pooler transaccional (6543) o `RESTORE_DATABASE_URL` remota | rechazados antes de conectar |

Pendiente (requiere `BACKUP_DATABASE_URL` real del dueño): un drill completo del backup de la
base de Supabase y de `pnpm backup:minio` contra su endpoint S3, y registrar aqui el resultado,
el plan de backup de Supabase y los tiempos.
