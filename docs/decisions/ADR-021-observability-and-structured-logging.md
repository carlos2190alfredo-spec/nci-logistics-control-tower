# ADR-021: Observabilidad Local y Logging Estructurado

**Estado:** Aceptada
**Fecha:** 2026-07-12

## Contexto

NCI LCT carece de observabilidad operativa: no hay request IDs, los logs no estan estructurados, no hay health checks, y no existe forma de detectar degradaciones de servicios hasta que un usuario reporta un error.

## Decision

Implementar un sistema de observabilidad local completo:

1. **Request ID**: Cada request obtiene un UUID via middleware de Next.js. Se propaga en headers `X-Request-ID`.
2. **Logger estructurado**: 8 niveles (debug, info, warn, error, security, audit, job, metric). Salida JSON con contexto (requestId, tenantId, userId, route).
3. **Redaccion de secretos**: 30+ claves sensibles redactadas automaticamente (password, token, otp, mfa, recoveryCode, backupEncryptionKey, databaseUrl, objectKey, session, cookie, signedUrl). Data URLs y strings largos truncados.
4. **Health checks**: Per-service con timeout de 5s. PostgreSQL via raw SQL, MinIO via HTTP, ClamAV via TCP PING/PONG, Mailpit via HTTP.
5. **Metricas**: Recoleccion bajo demanda via 19 queries paralelas (no polling en background).
6. **Alertas**: Deduplicacion con `dedupeKey` unico en DB, cooldown por severidad (P0: 5min, P1: 30min, P2: 60min), notificacion via Mailpit.
7. **Job runner**: `runObservedJob()` persiste inicio/fin/duracion/estado en tabla `JobRun`.

## Alternativas descartadas

- **OpenTelemetry/Prometheus**: Excesivo para deploy local con pocos usuarios. Se puede agregar en futuro sin cambiar la API interna.
- **Logs en archivo**: Riesgo de llenar disco, mas dificil de consultar que stdout JSON.
- **Polling de metricas**: Innecesario para escala actual; bajo demanda es suficiente.

## Consecuencias

- Todo request tiene trazabilidad de extremo a extremo.
- Los secretos nunca aparecen en logs generales.
- Degradaciones de servicio son detectables antes de que afecten usuarios.
- El dashboard de estado es accesible solo para roles de plataforma con MFA verificado.
