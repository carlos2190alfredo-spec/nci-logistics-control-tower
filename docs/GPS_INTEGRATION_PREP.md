# Preparacion de Integracion GPS

## Estado: PREPARADO (Disabled-First)

El conector GPS esta registrado en el catalogo de integraciones con un provider desactivado. No hace ninguna llamada HTTP externa.

## Modelo de datos listo

- `IntegrationConnector` con type=GPS en el catalogo
- `TenantIntegration` para activacion por tenant
- `IntegrationCredential` para apiKey y apiSecret cifrados
- `IntegrationEvent` para log de eventos

## Configuracion preparada

| Campo | Tipo | Requerido | Default |
|-------|------|-----------|---------|
| pollIntervalSeconds | number | No | 30 |

## Credenciales requeridas

| Clave | Descripcion |
|-------|-------------|
| apiKey | API key del proveedor GPS |
| apiSecret | Secret del proveedor GPS |

## Para activar

1. Implementar `GpsProvider` en `src/lib/integrations/providers/gps.ts`
2. Implementar metodos:
   - `testConnection(config)`: Verificar conectividad con el API del proveedor
   - `execute('getPositions', { vehicleIds })`: Obtener posiciones actuales
   - `execute('getHistory', { vehicleId, from, to })`: Historico de posiciones
3. Agregar `GPS_PROVIDER_BASE_URL` a `.env.example`
4. Registrar en el registry reemplazando `DisabledGpsProvider`
5. Crear tests con mock del API externo
6. Agregar cron job para polling de posiciones

## Proveedores GPS compatibles (futuros)

- Wialon / Gurtam
- Geotab
- Samsara
- CalAmp
- Queclink

## Notas de seguridad

- Las credenciales se cifran con AES-256-GCM antes de almacenar
- El polling interval minimo recomendado es 15 segundos para no saturar el API
- Los datos GPS son datos por tenant — nunca se comparten entre tenants
