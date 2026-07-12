# ADR-022: Alertas Operativas y Monitoreo de Salud

**Estado:** Aceptada
**Fecha:** 2026-07-12

## Contexto

La plataforma necesita detectar y notificar problemas operativos sin depender de que un operador revise logs manualmente. Se requiere un sistema que funcione en infraestructura local sin servicios cloud de monitoreo.

## Decision

### Modelo de alertas

- Tres niveles de severidad: P0 (bloqueante), P1 (degradado), P2 (advertencia).
- Deduplicacion via `dedupeKey` unico en la tabla `OperationalAlert`.
- Cooldown por severidad para evitar spam de notificaciones:
  - P0: 5 minutos (incidentes criticos necesitan atencion inmediata)
  - P1: 30 minutos
  - P2: 60 minutos
- Notificacion via Mailpit/SMTP configurable.

### Endpoints de salud

- `/api/internal/health`: Publico, solo estado agregado (HEALTHY/DEGRADED/UNHEALTHY). Sin detalles internos.
- `/api/internal/liveness`: Publico, solo `{alive: true}`. Para orquestadores.
- `/api/internal/readiness`: Autenticado (PLATFORM_SUPER_ADMIN/SUPPORT). Incluye detalle por servicio.
- `/api/internal/metrics`: Autenticado. Metricas operativas completas.

### Dashboard

- Ruta: `/platform/system-status`
- Acceso: Solo PLATFORM_SUPER_ADMIN y PLATFORM_SUPPORT con MFA verificado.
- Server-side rendering, no expone datos en client bundle.

## Alternativas descartadas

- **PagerDuty/OpsGenie**: Requiere integracion cloud, excesivo para deploy local.
- **Webhooks genericos**: Dificil de probar localmente; Mailpit es verificable.
- **Health checks en cron externo**: Pierde contexto de la aplicacion.

## Consecuencias

- Los operadores reciben notificaciones por email cuando hay degradaciones.
- El dashboard centraliza toda la informacion operativa en una sola vista.
- Los endpoints publicos no exponen informacion sensible.
- El sistema es extensible: nuevos checks se agregan como funciones async.
