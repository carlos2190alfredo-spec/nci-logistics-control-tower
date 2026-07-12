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
