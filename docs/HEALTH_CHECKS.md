# Health Checks

## Resumen

Cinco servicios son monitoreados continuamente. Cada check tiene un timeout de 5 segundos y retorna estado, duracion, mensaje y remediacion sugerida.

## Checks implementados

### PostgreSQL (critico)
- **Metodo**: `SELECT NOW()` via Prisma raw query
- **Saludable**: Query retorna al menos una fila
- **Fallo**: Conexion rechazada, timeout, query vacia
- **Remediacion**: `docker compose ps`, verificar DATABASE_URL

### Prisma (critico)
- **Metodo**: `SELECT 1` via Prisma `$queryRaw`
- **Saludable**: Query ejecuta sin error
- **Fallo**: Connection pool agotado, DB caida
- **Remediacion**: Verificar PostgreSQL, reiniciar app si connection pool corrupto

### MinIO (critico)
- **Metodo**: HTTP GET a `{MINIO_ENDPOINT}/minio/health/live`
- **Saludable**: Response HTTP 200
- **Fallo**: Conexion rechazada, timeout, HTTP non-200
- **Remediacion**: `docker compose ps`, verificar puerto 9000

### ClamAV (critico)
- **Metodo**: TCP PING/PONG en 127.0.0.1:3310
- **Saludable**: Respuesta contiene "PONG"
- **Fallo**: Conexion rechazada, timeout, respuesta inesperada
- **Remediacion**: `docker compose logs clamav`, verificar que clamd esta inicializado

### Mailpit (warning)
- **Metodo**: HTTP GET a `http://localhost:8025/api/v1/info`
- **Saludable**: Response HTTP 200
- **Degradado**: Cualquier fallo (Mailpit es opcional en desarrollo)
- **Remediacion**: `docker compose ps mailpit`

## Logica de agregacion

| Condicion | Estado general |
|-----------|----------------|
| Todos HEALTHY | HEALTHY |
| Algun critico UNHEALTHY | UNHEALTHY |
| Algun UNHEALTHY o DEGRADED (no critico) | DEGRADED |
| Algun UNKNOWN | DEGRADED |

## Endpoints

### GET /api/internal/health (publico)
Retorna solo estado agregado:
```json
{"status": "HEALTHY", "checkedAt": "2026-07-12T08:00:00Z"}
```
HTTP 200 si HEALTHY, 503 si no.

### GET /api/internal/liveness (publico)
```json
{"alive": true}
```
Siempre 200 si el proceso responde.

### GET /api/internal/readiness (autenticado)
Retorna HealthSummary completo con array de checks, uptime, version, commit.
Requiere PLATFORM_SUPER_ADMIN o PLATFORM_SUPPORT.

## Uso CLI

```bash
pnpm ops:health       # chequeo rapido
pnpm ops:readiness    # chequeo completo con JSON
```
