# Motor de Recomendacion de Conductores

## Arquitectura

Motor de reglas determinista (`RULES_ENGINE`) que evalua conductores candidatos para un viaje.

```
generateDriverRecommendationAction(formData)
  → Carga conductores del tenant
  → Carga horarios, excepciones, viajes asignados, incidencias, stats
  → recommendDriverForTrip(input)
  → Persiste DriverAssignmentRecommendation[]
  → audit()
```

## Sistema de puntuacion

### Bonificaciones
| Criterio | Puntos |
|----------|--------|
| Dentro de horario laboral | +30 |
| Sin conflicto de viajes | +20 |
| Vehiculo compatible | +15 |
| Sin incidencias recientes (0) | +10 |
| Baja carga del dia | +10 (escalado) |
| PWA sincronizada (<1h) | +5 |
| Turno extra registrado | +5 |

### Penalizaciones
| Criterio | Puntos |
|----------|--------|
| Conflicto con viaje(s) | -40 + descalificacion |
| Fuera de horario | -30 |
| Conductor inactivo | -20 + descalificacion |
| Muchas incidencias (>3 en 30d) | -15 |
| Sin horario configurado | -10 |
| PWA sin sync 24h+ | -10 |
| Vehiculo incompatible | -10 |
| En horario de descanso | -10 |

## Resultados

```typescript
interface RecommendationResult {
  recommended: ScoredDriver | null;  // Mejor candidato elegible
  alternatives: ScoredDriver[];      // Otros elegibles, ordenados por score
  disqualified: ScoredDriver[];      // Descalificados con razon
  explanation: string;               // Texto explicativo
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  generatedBy: "RULES_ENGINE";
}
```

## Nivel de riesgo

- **LOW**: score >= 30, <= 2 warnings
- **MEDIUM**: score < 30 o > 2 warnings
- **HIGH**: ningun conductor elegible

## Acciones

- **Aceptar**: asigna conductor al viaje, marca recomendacion como ACCEPTED
- **Override**: requiere `overrideReason`, marca recomendaciones como OVERRIDDEN, asigna conductor elegido manualmente

## Multi-tenant

Los conductores se filtran por `tenantId` al inicio. Un conductor de tenant X no aparece en recomendaciones de tenant Y.
