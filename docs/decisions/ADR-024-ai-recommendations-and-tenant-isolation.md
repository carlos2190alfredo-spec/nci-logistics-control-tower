# ADR-024: Recomendaciones IA Deterministas con Aislamiento por Tenant

**Estado:** Aceptada
**Fecha:** 2026-07-12

## Contexto

Se requiere un sistema de recomendaciones inteligentes para cada tenant que analice metricas operativas y sugiera acciones. Las restricciones son:
- No usar APIs externas de IA (OpenAI, Anthropic, etc.)
- No compartir datos entre tenants
- No ejecutar acciones criticas sin confirmacion
- Motor determinista y auditable

## Decision

### Motor de reglas deterministas

El `RulesBasedRecommendationEngine` evalua un conjunto de reglas contra el contexto operativo de un tenant. Cada regla tiene:

```typescript
interface RecommendationRule {
  id: string;
  category: string;
  evaluate(context: TenantContext): AiRecommendationInput[];
}
```

### Reglas implementadas (8 iniciales)

| ID | Categoria | Condicion | Prioridad |
|----|-----------|-----------|-----------|
| fleet-low-utilization | Flota | < 20% utilizacion en 30d | MEDIUM |
| driver-high-incidents | Conductores | > 3 incidentes en 30d | HIGH |
| driver-idle | Conductores | Sin viaje en 14d | LOW |
| ops-high-cancellation | Operaciones | > 15% cancelacion en 7d | HIGH |
| customer-pending-requests | Clientes | 5+ solicitudes sin convertir | MEDIUM |
| service-unused | Servicios | Sin viajes en 30d | LOW |
| system-alerts-recurring | Sistema | 3+ ocurrencias de alerta | MEDIUM |
| system-storage-growth | Sistema | > 20% crecimiento en 30d | MEDIUM |

### Aislamiento por tenant

1. **Context Builder**: `buildTenantContext(tenantId)` ejecuta 15+ queries Prisma, TODAS con `WHERE tenantId = ?`. Nunca se consultan datos de otro tenant.
2. **Safety Filter**: `validateTenantIsolation(tenantId, context)` valida que el contexto corresponda al tenant antes de evaluar.
3. **No Cross-Tenant**: Las recomendaciones se almacenan con `tenantId` obligatorio. La UI filtra por tenant en server-side.

### Filtros de seguridad

- `assertNoCriticalAction(recommendation)`: Agrega `requiresConfirmation: true` a recomendaciones con `actionRequired`
- `filterSensitiveFields(recommendation)`: Elimina campos como `passwordHash`, `token`, `secret`, `apiKey` del output

### Modelo de datos

- `TenantAiSetting`: Configuracion IA por tenant (habilitado/deshabilitado)
- `AiRecommendation`: Recomendaciones generadas con tipo, prioridad, estado, y datos estructurados
- `AiInsightEvent`: Eventos de insight para tracking

### Provider desactivado

El `DisabledAiProvider` en el registry de integraciones retorna `isEnabled() = false`. No existe ningun provider que haga llamadas a APIs externas de IA.

## Consecuencias

### Positivas
- Determinista: misma entrada = misma salida, auditable
- Cero dependencias externas, funciona offline
- Aislamiento total entre tenants
- Extensible: agregar reglas es implementar `RecommendationRule`

### Negativas
- Las reglas son basadas en umbrales fijos, no aprenden
- No genera texto natural ni analisis complejos
- Agregar reglas sofisticadas requiere desarrollo

## Referencias

- `src/lib/ai/` — implementacion completa
- `src/lib/ai/safety.ts` — filtros de seguridad
- `src/lib/ai/context-builder.ts` — constructor de contexto aislado
- `docs/AI_INTEGRATION_STRATEGY.md` — estrategia detallada
