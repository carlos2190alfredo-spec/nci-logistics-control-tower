# BACKUP RETENTION POLICY

Fecha: 2026-07-12 (actualizado 2026-11-13: staging y produccion en Supabase)

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

### Staging y produccion en Supabase (ADR-036)

La tabla "Piloto externo" y "Produccion" de arriba describen la meta. La realidad de hoy:

| Capa | Estado | Notas |
|---|---|---|
| Backups gestionados de Supabase | **Depende del plan; sin verificar** | Free: ninguno. Pro: copias diarias con retencion limitada. PITR: complemento de pago. Anote el plan y el nivel en `docs/BACKUP_ARCHITECTURE.md` tras revisar Dashboard → Database → Backups |
| Dump logico cifrado (`pnpm backup:postgres` con `BACKUP_DATABASE_URL`) | Funciona; **no esta automatizado** | Es el respaldo portable: independiente del plan y restaurable en cualquier Postgres 17 |
| Archivos de Storage (`pnpm backup:minio`) | Funciona; **no esta automatizado** | Los backups de la base no incluyen los objetos de Storage |

Politica minima para la base de Supabase (staging y produccion):

| Tipo | Frecuencia | Retencion | Notas |
|---|---|---|---|
| Dump logico cifrado + `backup:verify` | **Antes de cada `pnpm db:deploy`** (compuerta de `docs/STAGING_DEPLOYMENT.md`) | Hasta confirmar la migracion y un release mas | Es el punto de retorno si la migracion toca datos |
| Dump logico cifrado | Diario en produccion; semanal en staging | 7 diarios + 4 semanales | Copia fuera del equipo (almacenamiento externo cifrado) |
| Archivos de Storage | Semanal | 4 semanas | Mismos requisitos de cifrado |
| Drill de restore en un Postgres local descartable | Antes de la salida a produccion y despues mensual | Registro del ultimo drill | Ver "Drill de restore" en `docs/BACKUP_ARCHITECTURE.md`; un backup sin drill no cuenta |

- Hoy nada de esto corre solo: hasta programarlo en un equipo autorizado, la frecuencia depende de
  que alguien lo ejecute y la politica no se cumple de forma continua.
- `BACKUP_ENCRYPTION_KEY` sigue las reglas de "Custodia de claves". No va a Vercel.
- Los backups cifrados contienen datos de clientes: no se suben a repositorios ni a canales de chat.

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
