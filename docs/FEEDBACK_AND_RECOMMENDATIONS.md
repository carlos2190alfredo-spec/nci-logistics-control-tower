# Sistema de Feedback y Recomendaciones

## Feedback

### Flujo

1. Tenant owner/admin/ops manager abre `/t/[slug]/admin/feedback`
2. Llena formulario: tipo + titulo + descripcion
3. Server action crea `TenantFeedback` con tenantId del servidor (no del browser)
4. Accion queda en AuditLog
5. Plataforma ve todo el feedback en `/platform/feedback`

### Tipos de feedback

| Enum | Label |
|------|-------|
| BUG | Bug |
| FEATURE_REQUEST | Solicitud de funcionalidad |
| UX | Experiencia de usuario |
| PERFORMANCE | Rendimiento |
| INTEGRATION | Integracion |
| OTHER | Otro |

### Estados

| Enum | Label | Descripcion |
|------|-------|-------------|
| SUBMITTED | Enviado | Recien creado |
| IN_REVIEW | En revision | Plataforma lo esta revisando |
| ACKNOWLEDGED | Reconocido | Plataforma lo leyo |
| IN_PROGRESS | En progreso | Se esta trabajando |
| RESOLVED | Resuelto | Completado |
| CLOSED | Cerrado | Cerrado sin accion |
| WONT_FIX | No se arreglara | Rechazado |

### Aislamiento

- `tenantId` es obligatorio y se obtiene del servidor
- Queries siempre filtran por `tenantId` en el backend
- Plataforma ve todos los tenants; tenant solo ve los suyos

## Recomendaciones IA

### Motor

Motor de reglas deterministas (`RulesBasedRecommendationEngine`) que evalua el contexto operativo de un tenant y genera recomendaciones.

### Tipos de recomendacion

| Enum | Label | Significado |
|------|-------|-------------|
| OPTIMIZATION | Optimizacion | Mejora de eficiencia |
| ALERT | Alerta | Problema detectado |
| INSIGHT | Analisis | Observacion informativa |
| SUGGESTION | Sugerencia | Accion recomendada |

### Prioridades

- HIGH: Requiere atencion inmediata
- MEDIUM: Revisar pronto
- LOW: Informativo

### Estados

- PENDING: Sin revisar
- VIEWED: Leida por el usuario
- ACTED: Se tomo accion
- DISMISSED: Descartada

### 8 reglas iniciales

Ver ADR-024 para detalle completo de condiciones y umbrales.

### Seguridad

- Datos solo del tenant evaluado (buildTenantContext con WHERE tenantId)
- Filtros de seguridad antes de retornar resultados
- Acciones criticas requieren confirmacion
- Campos sensibles removidos del output
