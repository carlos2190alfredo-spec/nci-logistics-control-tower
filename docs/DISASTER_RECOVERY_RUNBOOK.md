# DISASTER RECOVERY RUNBOOK

Fecha: 2026-07-12

## Escenarios cubiertos

| Escenario | Severidad | Tiempo estimado de recuperacion |
|---|---|---|
| Corrupcion de PostgreSQL | Critica | 5-10 minutos |
| Perdida de datos en MinIO | Alta | 5-10 minutos |
| Eliminacion accidental de tablas | Critica | 5-10 minutos |
| Fallo de disco local | Critica | 15-30 minutos (con backup externo) |
| Configuracion corrupta | Media | 2-5 minutos |

## Pre-requisitos

1. `BACKUP_ENCRYPTION_KEY` disponible (64 chars hex)
2. Docker Compose operativo (PostgreSQL, MinIO)
3. Backup reciente verificado en `backups/<directorio>/`
4. Node.js + pnpm instalados

## Procedimiento: Restaurar PostgreSQL

### 1. Verificar el backup

```bash
pnpm backup:verify backups/<directorio>
```

Debe reportar `All files verified successfully`.

### 2. Identificar la entrada PostgreSQL en el manifiesto

```bash
cat backups/<directorio>/manifest.json | grep postgres
```

### 3. Restaurar a base de datos de prueba primero

```bash
# Descifrar y restaurar a DB aislada
BACKUP_ENCRYPTION_KEY=<clave> tsx scripts/backup/postgres-restore.ts backups/<directorio>
```

El script automaticamente:
- Verifica checksums del archivo cifrado y descifrado
- Crea `nci_logistics_restore_test`
- Restaura los datos
- Verifica tablas criticas
- Elimina la DB de prueba

### 4. Si la verificacion pasa, restaurar a produccion

```bash
# ATENCION: esto sobreescribe la base de datos de produccion
docker compose exec -T postgres psql -U nci -d postgres -c "DROP DATABASE IF EXISTS nci_logistics;"
docker compose exec -T postgres psql -U nci -d postgres -c "CREATE DATABASE nci_logistics;"
# Descifrar el backup (ya verificado en paso 3)
BACKUP_ENCRYPTION_KEY=<clave> tsx -e "
  const { decryptFile } = require('./scripts/backup/crypto');
  decryptFile('backups/<dir>/postgres-<stamp>.sql.enc', '/tmp/restore.sql')
    .then(() => console.log('Decrypted'))
"
docker compose exec -T postgres psql -U nci -d nci_logistics < /tmp/restore.sql
rm /tmp/restore.sql
```

### 5. Verificar

```bash
pnpm db:seed  # Solo si se necesita datos de demo
pnpm typecheck
pnpm test
```

## Procedimiento: Restaurar MinIO

### 1. Verificar el backup

```bash
pnpm backup:verify backups/<directorio>
```

### 2. Restaurar a bucket de prueba

El script de restore crea un bucket `nci-logistics-restore-test`, sube los objetos y verifica.

### 3. Si la verificacion pasa, restaurar al bucket principal

Usar la consola MinIO en `http://localhost:9001` o `mc` CLI para copiar objetos del bucket de prueba al principal.

## Procedimiento: DR Drill completo

```bash
# Ejecutar el drill completo (backup + verify + restore + cleanup)
pnpm backup:drill
```

El drill:
1. Crea backup cifrado de PostgreSQL, MinIO y configuracion
2. Verifica integridad de todos los archivos cifrados
3. Restaura PostgreSQL a DB aislada y verifica tablas criticas
4. Restaura MinIO a bucket aislado y verifica conteo de objetos
5. Limpia bases de datos y buckets de prueba
6. Genera reporte JSON en el directorio del backup

### Resultado esperado

```
DRILL PASSED
  [PASS] Backup PostgreSQL
  [PASS] Backup MinIO
  [PASS] Backup config
  [PASS] Save manifest
  [PASS] Verify backup integrity
  [PASS] Restore PostgreSQL — N tables restored and verified
  [PASS] Restore MinIO — N objects restored and verified
```

## Frecuencia de drills

| Fase | Frecuencia |
|---|---|
| Desarrollo local | Antes de sesiones de desarrollo mayores |
| Piloto | Semanal |
| Produccion | Semanal + antes de cada release |

## Contacto y escalacion

- Propietario tecnologico: NCI Automation
- Tiempo maximo aceptable sin datos: definir en SLA (pendiente para produccion)

## Checklist post-restauracion

- [ ] Verificar `docker compose ps` (todos los servicios healthy)
- [ ] Verificar `pnpm typecheck` (sin errores)
- [ ] Verificar `pnpm test` (todos los tests pasan)
- [ ] Verificar acceso web en `http://localhost:3000`
- [ ] Verificar login con usuario de prueba
- [ ] Verificar que los datos esperados existen (tenants, viajes, documentos)
- [ ] Ejecutar `pnpm security:check` (todas las verificaciones pasan)
