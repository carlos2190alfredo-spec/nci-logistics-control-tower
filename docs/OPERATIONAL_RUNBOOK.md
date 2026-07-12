# Runbook Operativo

## Comandos de diagnostico rapido

```bash
pnpm ops:health            # estado de servicios (exit code 0 = OK, 1 = problemas)
pnpm ops:readiness         # detalle completo con remediacion
pnpm ops:metrics           # metricas operativas en JSON
pnpm ops:jobs:list         # ultimos 25 jobs
pnpm ops:alerts:test       # prueba de alertas con Mailpit
pnpm ops:status-report     # genera docs/OPERABILITY_STATUS_LATEST.md
```

## Escenarios comunes

### PostgreSQL no responde

**Sintomas**: health check UNHEALTHY, app devuelve 500 en la mayoria de rutas.

```bash
docker compose ps                    # verificar estado
docker compose logs postgres --tail=50  # revisar logs
docker compose restart postgres      # reiniciar
pnpm ops:health                      # verificar recuperacion
```

### MinIO no responde

**Sintomas**: Uploads fallan, descargas de documentos fallan.

```bash
docker compose ps
docker compose logs minio --tail=50
docker compose restart minio
pnpm storage:init                    # recrear bucket si necesario
pnpm ops:health
```

### ClamAV no responde

**Sintomas**: Pipeline de archivos se bloquea (fail closed), uploads quedan en PENDING_SCAN.

```bash
docker compose logs clamav --tail=50   # clamd tarda ~30s en iniciar
docker compose restart clamav
# esperar 30-60 segundos para que clamd cargue signatures
pnpm ops:health
pnpm files:health                      # verificar pipeline de archivos
```

### Mailpit no disponible

**Sintomas**: Alertas no se notifican por email, password reset no envia correo.

```bash
docker compose ps mailpit
docker compose up -d mailpit
# Mailpit es opcional en desarrollo; el sistema funciona sin el
```

### Backups fallidos

**Sintomas**: ops:jobs:list muestra backup con status FAILED.

```bash
pnpm ops:jobs:list                     # ver detalle del fallo
pnpm backup:all                        # reintentar backup completo
pnpm backup:verify                     # verificar integridad
```

### Conflictos de sync offline

**Sintomas**: Dashboard muestra conflictos > 0.

```bash
pnpm ops:metrics                       # ver conteo de conflictos
# Revisar tabla OfflineCommandReceipt con status CONFLICT
# Los conflictos se resuelven manualmente desde el dashboard del tenant
```

### Archivos infectados detectados

**Sintomas**: Dashboard muestra archivos infectados > 0.

```bash
pnpm files:health                      # estado del pipeline
# Los archivos infectados permanecen en cuarentena
# No se pueden promover ni incluir en PODs
# Revisar en tabla FileAttachment con status INFECTED
```

## Verificacion post-deploy

```bash
pnpm ops:health                        # servicios OK
pnpm ops:readiness                     # detalle completo
pnpm typecheck                         # tipos OK
pnpm test                              # unit tests
pnpm security:check                    # verificaciones de seguridad
```

## Monitorizacion continua

El dashboard `/platform/system-status` es la vista principal para operadores. Accesible solo para PLATFORM_SUPER_ADMIN y PLATFORM_SUPPORT con MFA verificado.

Para generar un reporte periodico:
```bash
pnpm ops:status-report
cat docs/OPERABILITY_STATUS_LATEST.md
```
