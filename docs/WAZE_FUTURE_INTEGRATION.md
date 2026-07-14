# Integracion Futura con Waze

## Estado actual

`WazeFutureProvider` es un stub que retorna `NOT_REQUESTED`. No hace llamadas externas.

## Plan de integracion

Waze Transport SDK requiere:
1. Acuerdo de partner con Waze for Cities / Waze Transport SDK
2. Credenciales de partner
3. Implementacion del SDK como nuevo `IRouteProvider`

## Interfaz preparada

La interfaz `IRouteProvider` ya soporta Waze:

```typescript
interface IRouteProvider {
  getStatus(): RouteProviderStatus;
  estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult>;
}
```

El enum `RouteProvider` en Prisma ya incluye `WAZE_FUTURE`.

## Activacion

Cuando se tenga acceso al SDK:
1. Implementar `WazeRouteProvider` reemplazando el stub
2. Agregar `WAZE_TRANSPORT_SDK_KEY` a `.env.local`
3. Agregar modo `waze` a `createRouteProvider()`
4. Las mismas protecciones de seguridad aplican (sanitizar keys, no loguear credenciales)

## Referencia

- Waze for Cities: https://www.waze.com/wazeforcities/
- Waze Transport SDK: contactar equipo de partnerships
