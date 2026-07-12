# Estrategia de Integracion de IA — NCI Logistics Control Tower

Fecha: 2026-07-12
Version: 1.0
Agente: Claude Opus 4.6
Referencia: ADR-024 (por crear)

## Principio fundamental

**No se usan APIs externas de IA.** El motor de recomendaciones es determinista, basado en reglas, ejecutado localmente, y aislado por tenant. Esto garantiza:

- Predecibilidad: mismos datos → mismas recomendaciones
- Privacidad: ningun dato sale del sistema
- Costo cero: sin llamadas a servicios cloud
- Auditabilidad: cada recomendacion tiene una regla trazable
- Aislamiento: un tenant nunca ve datos de otro

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│ TenantAiSetting                                              │
│  enabled: boolean (default false)                            │
│  config: { enabledRuleCategories, thresholds, ... }          │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Context Builder (src/lib/ai/context-builder.ts)              │
│  → Recibe tenantId                                           │
│  → Consulta SOLO datos del tenant activo via Prisma          │
│  → WHERE tenantId = :tenantId en TODAS las queries           │
│  → Construye TenantContext con metricas agregadas            │
│  → NO accede a datos de otros tenants                        │
│  → NO persiste el contexto (efimero por request)             │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Safety Filters (src/lib/ai/safety.ts)                        │
│  → validateTenantIsolation(tenantId, context)                │
│  → assertNoExternalData(context)                             │
│  → assertNoCriticalAction(recommendation)                    │
│  → filterSensitiveFields(recommendation)                     │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ RulesBasedRecommendationEngine                               │
│  → Evalua reglas sobre TenantContext                         │
│  → Genera AiRecommendation[]                                 │
│  → Cada recomendacion tiene:                                 │
│    - ruleId (trazable)                                       │
│    - type (OPTIMIZATION, ALERT, INSIGHT, SUGGESTION)         │
│    - priority (LOW, MEDIUM, HIGH)                            │
│    - title, description (en espanol)                         │
│    - data (metricas que la generaron)                        │
│    - actionRequired: boolean                                 │
│    - requiresConfirmation: boolean (siempre true si accion)  │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Persistencia                                                 │
│  AiRecommendation → tabla en PostgreSQL (por tenant)         │
│  AiInsightEvent → log de ejecucion del motor                 │
└─────────────────────────────────────────────────────────────┘
```

## Modelo de datos

### TenantAiSetting

```prisma
model TenantAiSetting {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @unique @map("tenant_id") @db.Uuid
  enabled     Boolean @default(false)
  config      Json    @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  tenant      Tenant  @relation(...)
}
```

### AiRecommendation

```prisma
model AiRecommendation {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  ruleId           String   @map("rule_id")
  type             String   // OPTIMIZATION | ALERT | INSIGHT | SUGGESTION
  priority         String   // LOW | MEDIUM | HIGH
  title            String
  description      String
  data             Json     @default("{}")
  status           String   @default("PENDING") // PENDING | VIEWED | ACTED | DISMISSED
  actionRequired   Boolean  @default(false) @map("action_required")
  expiresAt        DateTime? @map("expires_at")
  viewedAt         DateTime? @map("viewed_at")
  actedAt          DateTime? @map("acted_at")
  dismissedAt      DateTime? @map("dismissed_at")
  createdAt        DateTime @default(now()) @map("created_at")
  tenant           Tenant   @relation(...)
}
```

### AiInsightEvent

```prisma
model AiInsightEvent {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  type         String   // RULES_EVALUATION | CONTEXT_BUILD | ERROR
  rulesRun     Int      @default(0) @map("rules_run")
  matchesFound Int      @default(0) @map("matches_found")
  durationMs   Int      @map("duration_ms")
  data         Json     @default("{}")
  processedAt  DateTime @default(now()) @map("processed_at")
  tenant       Tenant   @relation(...)
}
```

## Reglas del motor

Cada regla implementa la interfaz:

```typescript
interface RecommendationRule {
  id: string;
  category: RuleCategory;
  evaluate(context: TenantContext): AiRecommendationInput | null;
}
```

### Categorias de reglas

| Categoria | Reglas | Ejemplo |
|-----------|--------|---------|
| FLEET | fleet-low-utilization | Vehiculo X usado <20% en 30 dias |
| FLEET | fleet-maintenance-due | Vehiculo X sin actividad >60 dias |
| DRIVERS | driver-high-incidents | Conductor X con >3 incidencias en 30 dias |
| DRIVERS | driver-idle | Conductor X sin viaje asignado en 14 dias |
| OPERATIONS | ops-delivery-delays | >30% de viajes con retraso en 7 dias |
| OPERATIONS | ops-peak-detection | Volumen >2x promedio en dia/hora |
| CUSTOMERS | customer-volume-drop | Cliente X con -40% volumen mes vs mes |
| CUSTOMERS | customer-pending-requests | Cliente X con >5 solicitudes sin convertir |
| SERVICE_TYPES | service-unused | Tipo de servicio X sin uso en 30 dias |
| SYSTEM | system-alerts-recurring | Alerta X ocurre >3 veces en 24h |
| SYSTEM | system-storage-growth | Archivos creciendo >20% mes vs mes |

### Umbrales configurables

Cada tenant puede ajustar umbrales via `TenantAiSetting.config`:

```json
{
  "enabledRuleCategories": ["FLEET", "DRIVERS", "OPERATIONS"],
  "thresholds": {
    "fleet-low-utilization": { "minUtilizationPercent": 20, "periodDays": 30 },
    "driver-high-incidents": { "maxIncidents": 3, "periodDays": 30 },
    "customer-volume-drop": { "minDropPercent": 40 }
  }
}
```

## Filtros de seguridad

### Aislamiento de tenant

```typescript
function validateTenantIsolation(tenantId: string, context: TenantContext): void {
  if (context.tenantId !== tenantId) {
    throw new Error("AI_TENANT_ISOLATION_VIOLATION");
  }
  // Cada query en context-builder DEBE tener WHERE tenantId
}
```

### Sin datos externos

```typescript
function assertNoExternalData(context: TenantContext): void {
  // El context builder no hace fetch a URLs externas
  // No lee variables de entorno de otros servicios
  // No accede a datos de otros tenants
}
```

### Sin acciones criticas automaticas

```typescript
function assertNoCriticalAction(rec: AiRecommendation): void {
  if (rec.actionRequired) {
    rec.requiresConfirmation = true;
    // La IA sugiere, el humano confirma
  }
}
```

## Vistas

### Para plataforma (`/platform/recommendations`)

- Todas las recomendaciones de todos los tenants
- Filtros por tenant, tipo, prioridad, estado
- Metricas: total generadas, vistas, actuadas, tasa de accion

### Para tenant (`/t/[tenantSlug]/admin/recommendations`)

- Solo recomendaciones del tenant activo
- Acciones: ver detalle, marcar como vista, actuar, descartar
- No puede ver recomendaciones de otros tenants

## Ejecucion

El motor se ejecuta:
- **Bajo demanda**: al visitar la pagina de recomendaciones (server-side)
- **No hay cron**: no se ejecuta en background (requiere infraestructura adicional)
- **Cache**: las recomendaciones se persisten; se regeneran si las mas recientes tienen >24h

## Lo que NO hace la IA

1. No llama APIs externas (OpenAI, Anthropic, Google, etc.)
2. No accede a datos de otros tenants
3. No ejecuta acciones sin confirmacion del usuario
4. No persiste modelos ML ni embeddings
5. No procesa lenguaje natural
6. No hace predicciones probabilisticas
7. No envia datos fuera del sistema
8. No lee datos personales para recomendaciones (no usa emails, passwords, etc.)

## Provider desactivado

```typescript
class DisabledAiProvider implements AiProvider {
  async generateRecommendations(_tenantId: string): Promise<AiRecommendation[]> {
    return [];
  }

  isEnabled(): boolean {
    return false;
  }
}
```

El provider desactivado es el default. Se activa `RulesBasedRecommendationEngine` solo cuando `TenantAiSetting.enabled = true` para un tenant especifico.

## Ruta de evolucion futura

| Fase | Descripcion | Prerequisito |
|------|-------------|-------------|
| Actual | Reglas deterministas locales | — |
| Futura 1 | Cron job para evaluacion periodica | Job runner existente |
| Futura 2 | Reglas ML locales (anomaly detection) | Datos historicos suficientes |
| Futura 3 | LLM local (Ollama) para resumen | Infraestructura GPU |
| Futura 4 | API externa opcional con consentimiento | Politica de datos, legal |

Cada fase futura requiere un ADR, consentimiento del tenant, y pruebas de aislamiento.
