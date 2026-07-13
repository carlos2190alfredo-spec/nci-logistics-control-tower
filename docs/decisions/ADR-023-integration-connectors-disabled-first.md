# ADR-023: Conectores de Integracion con Patron Disabled-First

**Estado:** Aceptada
**Fecha:** 2026-07-12

## Contexto

La plataforma necesita preparar integraciones con sistemas externos (GPS, WhatsApp, CRM, Facturacion, Email, IA, Webhooks) pero sin activar conexiones reales hasta que existan credenciales y aprobacion del operador. Se necesita una arquitectura que permita agregar proveedores futuros sin modificar el nucleo.

## Decision

### Patron Disabled-First

Cada conector se implementa con un provider que implementa la interfaz `IntegrationProvider`:

```typescript
interface IntegrationProvider {
  type: IntegrationConnectorType;
  name: string;
  isEnabled(): boolean;
  testConnection(config): Promise<ConnectionTestResult>;
  execute(action, payload): Promise<unknown>;
}
```

Todos los providers iniciales retornan `isEnabled() = false` y lanzan error en `testConnection()` y `execute()`. Esto garantiza que ningun conector hace peticiones HTTP externas.

### Catalogo de conectores

El `CONNECTOR_CATALOG` define los 7 conectores disponibles con:
- Tipo (enum `IntegrationConnectorType`)
- Schema de configuracion (campos requeridos por conector)
- Claves de credenciales requeridas

### Credenciales cifradas

Las credenciales de integracion se almacenan cifradas con AES-256-GCM usando `INTEGRATION_ENCRYPTION_KEY` (variable de entorno, 64 caracteres hex = 32 bytes). El patron es identico al usado para secretos MFA (ADR-018).

- `encryptCredential(plaintext)` retorna `{encryptedValue, iv, authTag}`
- `decryptCredential(encryptedValue, iv, authTag)` retorna el texto plano
- IV aleatorio de 12 bytes por operacion

### Modelo de datos

- `IntegrationConnector`: catalogo global de conectores disponibles
- `TenantIntegration`: activacion por tenant con status (DISABLED/ENABLED/ERROR/CONFIGURING)
- `IntegrationCredential`: credenciales cifradas por tenant-integracion
- `IntegrationEvent`: log de eventos por integracion

### Registro de providers

`src/lib/integrations/registry.ts` mantiene un mapa tipo → provider. Solo se registran providers desactivados inicialmente. Activar un provider real requiere:
1. Implementar la interfaz `IntegrationProvider`
2. Registrar en el mapa del registry
3. Proveer credenciales cifradas
4. Cambiar status a ENABLED

## Consecuencias

### Positivas
- Cero riesgo de llamadas HTTP externas no autorizadas
- Arquitectura extensible para agregar providers reales
- Credenciales nunca en texto plano en DB
- Cada tenant tiene su propia configuracion aislada

### Negativas
- Los providers desactivados son stubs — no sirven como documentacion funcional del API externo
- Activar un provider real requiere desarrollo e integracion de testing

## Referencias

- `src/lib/integrations/` — implementacion completa
- `src/lib/integrations/credential-crypto.ts` — cifrado de credenciales
- ADR-018 — patron de cifrado AES-256-GCM reutilizado
