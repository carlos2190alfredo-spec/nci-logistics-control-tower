# ADR-031: AI Invocation Tracking and Usage Monitoring

**Estado:** Aceptada  
**Fecha:** 2026-07-14  
**Contexto:** ADR-029

## Contexto

Para controlar costos, detectar abuso y cumplir requisitos de auditoria, cada interaccion con el proveedor de IA debe registrarse.

## Decision

1. **AiInvocation**: registro por invocacion con tenantId, userId, requestId, provider, model, purpose, status, token counts, durationMs, fallbackUsed, errorCode.

2. **AiUsageDaily**: agregado diario por tenant con conteos de requests, successes, failures, fallbacks, blocked, y totales de tokens.

3. **Server actions** llaman `logInvocation()` despues de cada completion, antes del audit log.

4. **Status BLOCKED**: cuando se detecta prompt injection, se registra como blocked.

5. **UI**: la pagina de Copiloto IA muestra metricas diarias y las 10 ultimas invocaciones.

## Consecuencias

- Los administradores pueden ver cuanto IA se consume por tenant
- Las invocaciones bloqueadas son visibles como alerta de seguridad
- Los datos de tracking son por tenant (aislamiento preservado)
- Se puede implementar rate limiting por tenant basado en AiUsageDaily
