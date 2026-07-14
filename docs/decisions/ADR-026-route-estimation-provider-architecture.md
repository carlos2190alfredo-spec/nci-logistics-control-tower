# ADR-026: Arquitectura de Proveedores de Estimacion de Ruta

**Estado:** Aceptada
**Fecha:** 2026-07-13

## Contexto

Los viajes necesitan estimaciones de distancia, duracion y ETA por parada. La plataforma debe funcionar sin API keys externas (modo local/demo), con un simulador para pruebas, y con Google Routes API cuando este configurada.

## Decision

### Patron disabled-first con factory

Se implementa el patron `IRouteProvider` con cuatro implementaciones:

| Proveedor | Cuando se usa | Llamadas externas |
|-----------|---------------|-------------------|
| `DisabledRouteProvider` | `GOOGLE_MAPS_ROUTES_MODE=disabled` (default) | Ninguna |
| `SimulatedRouteProvider` | `GOOGLE_MAPS_ROUTES_MODE=simulated` | Ninguna |
| `GoogleRoutesProvider` | `GOOGLE_MAPS_ROUTES_MODE=google` + `GOOGLE_MAPS_API_KEY` | Google Routes API |
| `WazeFutureProvider` | Reservado para futuro | Ninguna |

La factory `createRouteProvider(mode)` lee `GOOGLE_MAPS_ROUTES_MODE` del entorno. Si el modo es `google` pero no hay API key, retorna `FAILED` con `NO_API_KEY`.

### Modelo de datos

- `TripStop`: paradas del viaje con coordenadas, tipo, secuencia, ventanas de tiempo
- `TripRouteEstimate`: resultado de la estimacion (distancia, duracion, trafico, polyline)
- `TripStopEstimate`: ETA por parada individual
- Cache por `providerRequestHash` para evitar recalculos

### Seguridad

- API key nunca se loguea ni aparece en mensajes de error (`sanitizeErrorMessage`)
- Sin llamadas HTTP en modo disabled/simulated/waze
- Coordenadas filtradas por tenant
- Tests unitarios verifican que sin API key no se hace fetch

## Consecuencias

- La plataforma funciona completamente sin Google API key
- Se puede activar Google Routes con solo dos variables de entorno
- Waze queda preparado como stub sin codigo muerto
- Haversine a 60 km/h es suficiente para demo y desarrollo
