# Configuracion de Google Maps Routes API

## Requisitos previos

1. Proyecto en Google Cloud Console con billing habilitado
2. Routes API habilitada (buscar "Routes API" en API Library)
3. API key con restriccion a Routes API

## Variables de entorno

```env
GOOGLE_MAPS_ROUTES_MODE="google"
GOOGLE_MAPS_API_KEY="AIza..."
```

## Endpoint utilizado

```
POST https://routes.googleapis.com/directions/v2:computeRoutes
```

### Field mask

```
routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.polyline.encodedPolyline,routes.legs.*
```

### Headers

```
Content-Type: application/json
X-Goog-Api-Key: <API_KEY>
X-Goog-FieldMask: <field_mask>
```

## Costo estimado

Segun precios de Google Maps Platform (mayo 2025):
- Routes API Basic: $5 USD / 1000 requests
- Routes API Advanced (con trafico): $10 USD / 1000 requests

## Sin API key

Cuando `GOOGLE_MAPS_ROUTES_MODE="google"` pero no hay `GOOGLE_MAPS_API_KEY`, el proveedor retorna:
- `status: "FAILED"`
- `errorCode: "NO_API_KEY"`
- No se hace ninguna llamada HTTP

## Modo simulado

Para desarrollo y demo, usar `GOOGLE_MAPS_ROUTES_MODE="simulated"`. Calcula distancia por Haversine y estima duracion a 60 km/h. No requiere API key ni Internet.

## Seguridad

- La API key se lee de `process.env.GOOGLE_MAPS_API_KEY`
- Nunca se loguea la key
- Los mensajes de error sanitizan patrones `AIza...` y `key=...`
- No almacenar la key en `.env` versionado (solo en `.env.local`)
