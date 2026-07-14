# Arquitectura de Estimacion de Ruta

## Flujo

```
Usuario → "Calcular Ruta" → calculateRouteEstimateAction
  → Valida trip tiene 2+ stops con coordenadas
  → Lee GOOGLE_MAPS_ROUTES_MODE del entorno
  → createRouteProvider(mode) → IRouteProvider.estimate()
  → Persiste TripRouteEstimate + TripStopEstimate[]
  → Cache por providerRequestHash (no recalcula si ya existe)
  → audit() + revalidatePath()
```

## Proveedores

### DisabledRouteProvider
Retorna `NOT_REQUESTED`. Sin calculos, sin llamadas externas. Default.

### SimulatedRouteProvider
Calcula distancia con formula Haversine (radio terrestre 6371 km). Asume velocidad promedio de 60 km/h. Genera legs con ETA acumulativo por parada.

### GoogleRoutesProvider
Usa `routes.googleapis.com/directions/v2:computeRoutes`. Field mask incluye duracion, distancia, polyline y legs. Si no hay API key, retorna `FAILED` con `NO_API_KEY` sin hacer fetch. Errores sanitizados para no exponer la key.

### WazeFutureProvider
Stub. Retorna `NOT_REQUESTED`. Preparado para integracion futura con Waze Transport SDK.

## Modelo de datos

- **TripStop**: paradas con coordenadas, tipo (START/PICKUP/DELIVERY/RETURN/OTHER), secuencia
- **TripRouteEstimate**: resultado de estimacion con distancia, duracion, trafico, polyline, proveedor
- **TripStopEstimate**: ETA individual por parada

## Configuracion

```env
GOOGLE_MAPS_ROUTES_MODE="disabled"   # disabled | simulated | google
GOOGLE_MAPS_API_KEY=""               # Solo cuando mode=google
```

## Seguridad

- API key nunca en logs ni mensajes de error
- Sin HTTP en modos disabled/simulated/waze
- Coordenadas aisladas por tenant
- Hash determinista para cache (evita recalculos innecesarios)
