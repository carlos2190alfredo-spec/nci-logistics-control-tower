# DeepSeek Provider Architecture

## Componentes

```
src/lib/ai/
  providers/
    provider-types.ts       # Interfaces: IAiProvider, AiCompletionRequest/Result, AiPurpose
    disabled-provider.ts    # Retorna mensaje de IA desactivada
    rules-provider.ts       # Respuestas deterministas por purpose (sin LLM)
    deepseek-provider.ts    # OpenAI SDK apuntando a DeepSeek API
    provider-factory.ts     # Factory: auto/disabled/rules/deepseek
  deepseek-config.ts        # Lee env vars con defaults
  deepseek-health.ts        # Estado del proveedor para UI
  prompt-safety.ts          # Deteccion de inyeccion, sanitizacion
  tenant-context.ts         # Construye contexto sanitizado desde DB
  copilot-actions.ts        # Funciones de completion con Zod validation

src/lib/server/
  copilot-actions.ts        # Server actions con auth + audit + tracking
```

## Flujo de una invocacion

1. Usuario hace click en "Generar resumen" en la UI
2. Server action valida auth (`requireTenantRole`) y obtiene `TenantAiSetting`
3. `safeComplete()` en copilot-actions.ts:
   a. Detecta prompt injection → si detecta, retorna fallback
   b. `createAiProvider()` selecciona proveedor segun configuracion
   c. Provider ejecuta completion
   d. Si DeepSeekError, cae a RulesBasedAiProvider
   e. Sanitiza output del modelo
   f. Valida JSON con schema Zod
   g. Si parse falla, retorna fallback
4. Server action registra invocacion en AiInvocation y AiUsageDaily
5. Server action registra en audit log
6. `revalidatePath()` refresca la pagina

## Proveedor Factory

```
NODE_ENV=test → RulesBasedAiProvider (siempre)
mode=disabled || !tenantAiEnabled → DisabledAiProvider
mode=rules → RulesBasedAiProvider
mode=deepseek → DeepSeekProvider (si hay config) || RulesBasedAiProvider
mode=auto → DeepSeekProvider (si hay API key) || RulesBasedAiProvider
```

## Propositos soportados (AiPurpose)

| Purpose | Contexto | Schema Zod |
|---------|----------|------------|
| `operations_summary` | Estado operativo del tenant | OperationsSummarySchema |
| `trip_risk` | Datos del viaje + incidentes | TripRiskSchema |
| `driver_recommendation_explanation` | Scores de recomendacion | DriverExplanationSchema |
| `feedback_summary` | Feedback de 30 dias | FeedbackSummarySchema |
| `incident_summary` | Incidentes de 30 dias | IncidentSummarySchema |

## Modelos de datos

### AiInvocation
Registro individual: tenant, user, request ID, provider, model, purpose, status, tokens, duration, fallback, error.

### AiUsageDaily
Agregado diario por tenant: requests, successes, failures, fallbacks, blocked, tokens totales.
