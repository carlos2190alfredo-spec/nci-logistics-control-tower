# BACKUP RETENTION POLICY

Fecha: 2026-07-12

## Politica de retencion

### Desarrollo local (actual)

| Tipo | Frecuencia | Retencion | Notas |
|---|---|---|---|
| DR drill | Antes de cada sesion de desarrollo mayor | 3 ultimos drills | Verificar que restore funciona |
| Backup manual | Antes de migraciones destructivas | Hasta confirmar migracion exitosa | Eliminar despues de confirmar |
| Backup ad-hoc | Segun necesidad | 7 dias | Para experimentacion segura |

### Piloto externo (futuro)

| Tipo | Frecuencia | Retencion | Notas |
|---|---|---|---|
| Backup completo | Diario | 7 dias (7 copias) | Automatizar con cron |
| Backup semanal | Semanal (domingo) | 4 semanas (4 copias) | Rotacion automatica |
| DR drill | Semanal | Ultimo drill exitoso | Alertar si falla |

### Produccion (futuro)

| Tipo | Frecuencia | Retencion | Notas |
|---|---|---|---|
| Backup completo | Cada 6 horas | 48 horas (8 copias) | Considerar WAL streaming |
| Backup diario | Diario | 30 dias | Storage externo cifrado |
| Backup mensual | Mensual | 12 meses | Archivo a largo plazo |
| DR drill | Semanal | Reporte + ultimos 3 drills | Obligatorio antes de cada release |

## Rotacion

Los backups se almacenan en `backups/` con timestamp en el nombre del directorio. La limpieza manual es responsabilidad del operador en la fase actual.

Para automatizacion futura:
```bash
# Eliminar drills de mas de 7 dias
find backups/ -name "drill-*" -maxdepth 1 -mtime +7 -exec rm -rf {} \;

# Mantener solo los ultimos N backups
ls -dt backups/2026-* | tail -n +8 | xargs rm -rf
```

## Custodia de claves

- `BACKUP_ENCRYPTION_KEY` debe almacenarse fuera del repositorio
- En produccion: gestor de secretos (AWS Secrets Manager, HashiCorp Vault, o similar)
- Backup de la clave en ubicacion fisica separada (caja fuerte, sobre sellado)
- Perdida de la clave = perdida de acceso a todos los backups cifrados con ella
- Rotacion de clave: cifrar nuevos backups con nueva clave; los antiguos quedan con la clave anterior

## Verificacion

- Todo backup debe ser verificable con `pnpm backup:verify <dir>`
- El DR drill (`pnpm backup:drill`) prueba el ciclo completo
- Un backup no verificado no cuenta como backup valido
