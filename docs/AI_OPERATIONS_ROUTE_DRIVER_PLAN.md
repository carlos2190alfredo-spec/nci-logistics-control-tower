# Plan: Route ETA + Driver Recommendation AI

Fecha: 2026-07-13
Fase: AI OPERATIONS + ROUTE ETA + DRIVER RECOMMENDATION
Commit base: 5f4c3b9

## 1. Estado actual

La plataforma NCI Logistics Control Tower tiene:

- Motor IA basado en reglas con 8 reglas deterministas (fleet, drivers, operations, customers, service types, system).
- Integraciones disabled-first con 7 conectores (GPS, WhatsApp, CRM, Billing, Email, AI, Webhooks).
- Modelo Trip con campos `origin`, `destination`, `routePoints` (JSON), `scheduledAt`, `eta`, `expectedDuration`.
- Modelo Driver con `status`, `authorizations` (JSON), relacion a User.
- TripAssignment con driver, vehicle, equipment, scheduledAt.
- No hay paradas formales (TripStop).
- No hay estimacion de ruta con proveedor externo.
- No hay horarios laborales de conductores.
- No hay recomendacion de conductor basada en reglas operativas.
- No hay Google Routes API integrado.
- No hay Waze integrado.

## 2. IA existente hoy

- `RulesBasedRecommendationEngine` en `src/lib/ai/recommendations.ts`.
- 8 reglas que evaluan contexto agregado del tenant.
- `TenantContext` con metricas de flota, conductores, operaciones, clientes, tipos de servicio, sistema.
- `TenantAiSetting` por tenant con enable/disable y config de umbrales.
- `AiRecommendation` persistida con tipo, prioridad, estado.
- `AiInsightEvent` para log de ejecucion.
- Safety filters: aislamiento tenant, sin datos externos, sin acciones criticas automaticas.
- Ejecucion bajo demanda (server-side al visitar recomendaciones).

## 3. Que se integra en esta fase

1. **TripStop**: Modelo formal de paradas del viaje (START, PICKUP, DELIVERY, RETURN, OTHER).
2. **TripRouteEstimate**: Estimacion de ruta con proveedor (disabled, simulated, Google Routes).
3. **TripStopEstimate**: ETA por parada.
4. **Route Provider Architecture**: DisabledRouteProvider, SimulatedRouteProvider, GoogleRoutesProvider, WazeFutureProvider.
5. **DriverWorkSchedule**: Horarios laborales semanales.
6. **DriverAvailabilityException**: Excepciones (dia libre, vacaciones, incapacidad, turno extra).
7. **DriverAssignmentRecommendation**: Recomendacion de conductor con score, explicacion, riesgos.
8. **UI de creacion de viaje mejorada**: Paradas, estimacion de ruta, recomendacion de conductor.
9. **UI de horarios de conductores**: Gestion de horarios y excepciones.
10. **Dashboard de operaciones AI**: Insights operativos para tenant.

## 4. Que NO se integra

- IA para el dueno global de la plataforma.
- WhatsApp real.
- GPS real.
- Waze real.
- IA externa generativa (OpenAI, Anthropic, etc.).
- Geocodificacion real sin API key.
- Navegacion turn-by-turn.
- Tracking en tiempo real.
- Optimizacion de rutas multi-vehiculo.

## 5. Estimacion de ruta

### Flujo

1. Usuario crea viaje con paradas (origen, recogida, entregas).
2. Sistema evalua proveedor disponible:
   - Si `GOOGLE_MAPS_ROUTES_MODE=google` y existe `GOOGLE_MAPS_API_KEY` y tenant tiene integracion activa → GoogleRoutesProvider.
   - Si `GOOGLE_MAPS_ROUTES_MODE=simulated` → SimulatedRouteProvider (calculo haversine).
   - Si `GOOGLE_MAPS_ROUTES_MODE=disabled` o sin configuracion → DisabledRouteProvider.
3. Proveedor calcula distancia, duracion, trafico (si aplica), ETA por parada.
4. Resultado persistido en TripRouteEstimate y TripStopEstimate.
5. Cache por providerRequestHash — no recalcular si sigue vigente.
6. UI muestra resultado con estado claro.

### Simulacion (sin API key)

- Calculo haversine entre puntos.
- Velocidad promedio configurable (60 km/h default).
- Duracion = distancia / velocidad.
- Sin trafico (trafficDurationSeconds = null).
- Status: ESTIMATED, provider: SIMULATED.

## 6. Por que Google Routes API

- API oficial de Google para calculo de rutas.
- Soporte de trafico en tiempo real.
- Soporte de waypoints intermedios.
- Documentacion extensa.
- Pricing por request (pay-as-you-go).
- Field masks para pedir solo campos necesarios.
- No requiere SDK pesado — solo HTTP fetch.

## 7. Por que Waze queda como futuro

- Waze Transport SDK requiere activacion partner.
- Waze esta orientado a navegacion, no a calculo de ETA backend.
- Google Routes cubre el caso de uso de ETA backend.
- Waze queda como proveedor futuro de navegacion para conductores.

## 8. Fallback disabled/simulado

- Sin API key: SimulatedRouteProvider calcula con haversine.
- Sin coordenadas: DisabledRouteProvider devuelve NOT_REQUESTED.
- UI muestra mensaje claro: "Google Maps no esta configurado. Se usa estimacion basica."
- Creacion de viaje NO se bloquea por falta de estimacion.

## 9. Recomendacion de conductor

### Datos que usa

- Horarios laborales (DriverWorkSchedule).
- Excepciones de disponibilidad (DriverAvailabilityException).
- Viajes asignados del dia (Trip con driverId y scheduledAt).
- Tipo de vehiculo requerido vs vehiculo del conductor.
- Incidencias recientes.
- Ultima sincronizacion PWA.
- Estado activo del conductor.
- Carga de trabajo.

### Datos que NO usa

- Ubicacion GPS en tiempo real (no activo).
- Historial de calificaciones (no existe).
- Datos de otros tenants.
- APIs externas.

### Scoring

| Factor | Puntos |
|--------|--------|
| Dentro de horario laboral | +30 |
| Sin conflicto de viaje | +20 |
| Vehiculo compatible | +15 |
| Menor carga de trabajo | +10 |
| Buena puntualidad | +10 |
| PWA sincronizada | +5 |
| Proximidad base | +5 |
| Fuera de horario | -30 |
| Conflicto directo | -40 |
| Conductor inactivo | -20 |
| Muchas incidencias | -15 |
| PWA sin sync | -10 |

### Salida

- Conductor recomendado con score.
- Explicacion en texto.
- Nivel de riesgo (LOW, MEDIUM, HIGH).
- Lista de conductores descartados con razon.
- Warnings operativos.
- Estado: GENERATED, ACCEPTED, DISMISSED, OVERRIDDEN.

## 10. Aislamiento cross-tenant

- Todas las queries con `WHERE tenantId = :tenantId`.
- TripStop, TripRouteEstimate, TripStopEstimate incluyen tenantId.
- DriverWorkSchedule, DriverAvailabilityException incluyen tenantId.
- DriverAssignmentRecommendation incluye tenantId.
- Server actions validan tenant desde sesion, no desde request body.
- Google API key es global (env var), no por tenant. No se expone al frontend.

## 11. Riesgos

| Riesgo | Mitigacion |
|--------|-----------|
| Google API key filtrada en logs | Redaccion automatica en logger |
| Estimacion obsoleta usada como real | ExpiresAt y estado STALE |
| Conductor asignado fuera de horario | Warning explicito, no bloqueo |
| Multiples recomendaciones concurrentes | Recomendacion es idempotente por tripId |
| Coordenadas incorrectas | Validacion de rango lat/lon |
| Migracion rompe datos existentes | Campos nuevos nullable, modelos nuevos |

## 12. Criterios de aceptacion

1. Crear viaje con paradas (origen, recogida, entregas).
2. Calcular estimacion simulada sin API key.
3. UI muestra estado claro de proveedor.
4. Configurar horario de conductor.
5. Crear excepcion de disponibilidad.
6. Generar recomendacion de conductor con score.
7. Asignar conductor recomendado.
8. Ignorar recomendacion con razon obligatoria.
9. Tenant no ve datos de otro tenant.
10. Google API key no aparece en logs ni frontend.
11. Build limpio.
12. Tests pasan.
13. Security checks pasan.

## 13. Modelos de datos nuevos

- TripStop
- TripRouteEstimate
- TripStopEstimate
- DriverWorkSchedule
- DriverAvailabilityException
- DriverAssignmentRecommendation

## 14. Archivos nuevos principales

- `src/lib/routes/types.ts`
- `src/lib/routes/providers/disabled-route-provider.ts`
- `src/lib/routes/providers/simulated-route-provider.ts`
- `src/lib/routes/providers/google-routes-provider.ts`
- `src/lib/routes/providers/waze-future-provider.ts`
- `src/lib/routes/route-service.ts`
- `src/lib/ai/driver-recommendation.ts`
- `src/lib/server/route-actions.ts`
- `src/lib/server/driver-schedule-actions.ts`
- `src/lib/server/driver-recommendation-actions.ts`
- `src/app/t/[tenantSlug]/admin/drivers/[driverId]/schedule/page.tsx`
- `src/app/t/[tenantSlug]/admin/operations-insights/page.tsx`
- `docs/ROUTE_ESTIMATION_ARCHITECTURE.md`
- `docs/GOOGLE_MAPS_ROUTES_SETUP.md`
- `docs/WAZE_FUTURE_INTEGRATION.md`
- `docs/DRIVER_RECOMMENDATION_ENGINE.md`
- `docs/DRIVER_SCHEDULES.md`
- `docs/TENANT_OPERATIONS_AI_GUIDE.md`
- `docs/decisions/ADR-026-route-estimation-provider-architecture.md`
- `docs/decisions/ADR-027-driver-recommendation-rules-engine.md`
- `docs/decisions/ADR-028-tenant-operations-ai-scope.md`
