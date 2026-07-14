# ADR-027: Motor de Recomendacion de Conductores Basado en Reglas

**Estado:** Aceptada
**Fecha:** 2026-07-13

## Contexto

Se necesita asignar el mejor conductor disponible a cada viaje. La fase actual no activa IA externa generativa — se usa un motor de reglas determinista.

## Decision

### Motor de puntuacion

`recommendDriverForTrip()` evalua cada conductor con reglas aditivas:

| Criterio | Puntos | Tipo |
|----------|--------|------|
| Dentro de horario laboral | +30 | Bonus |
| Sin conflicto de viajes | +20 | Bonus |
| Vehiculo compatible | +15 | Bonus |
| Sin incidencias recientes | +10 | Bonus |
| Baja carga del dia | +10 (escalado) | Bonus |
| PWA sincronizada (<1h) | +5 | Bonus |
| Turno extra registrado | +5 | Bonus |
| Conflicto con viaje(s) | -40 + descalificado | Penalizacion |
| Fuera de horario | -30 | Penalizacion |
| Conductor inactivo | -20 + descalificado | Penalizacion |
| Muchas incidencias (>3) | -15 | Penalizacion |
| Sin horario configurado | -10 | Penalizacion |
| PWA sin sync 24h+ | -10 | Penalizacion |

### Descalificacion

Un conductor se descalifica (no elegible) cuando tiene `disqualificationReason`:
- Estado != AVAILABLE
- Excepcion de disponibilidad (vacaciones, dia libre, incapacidad)
- Conflicto con viaje asignado

### Nivel de riesgo

- **LOW**: conductor recomendado con score >= 30 y <= 2 warnings
- **MEDIUM**: conductor recomendado con score < 30 o > 2 warnings
- **HIGH**: ningun conductor elegible

### Aislamiento multi-tenant

Los conductores se filtran por `tenantId` antes de la evaluacion. Un conductor de otro tenant nunca aparece en los resultados.

### Override

La aceptacion de recomendacion asigna el conductor al viaje. El override requiere `overrideReason` obligatorio y audita la accion.

## Consecuencias

- Motor determinista, sin llamadas externas, testeable con unit tests
- Se puede migrar a IA externa en fase futura sin cambiar la interfaz
- `generatedBy: "RULES_ENGINE"` permite distinguir origen en el futuro
