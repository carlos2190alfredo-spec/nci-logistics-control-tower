# Arquitectura de Integraciones

## Resumen

El sistema de integraciones sigue un patron **disabled-first**: todos los conectores se preparan con interfaces tipadas y modelos de datos, pero ningun proveedor hace llamadas HTTP externas. Activar un conector real requiere implementar el provider, proveer credenciales cifradas y cambiar el estado a ENABLED.

## Conectores disponibles

| Conector | Tipo | Estado | Credenciales requeridas |
|----------|------|--------|------------------------|
| GPS Telematico | GPS | Desactivado | apiKey, apiSecret |
| WhatsApp Cloud | WHATSAPP | Desactivado | accessToken |
| CRM Externo | CRM | Desactivado | apiKey |
| Facturacion Electronica | BILLING | Desactivado | apiKey, certificatePassword |
| Email SMTP | EMAIL | Desactivado | username, password |
| Motor IA | AI | Desactivado | (ninguna) |
| Webhooks | WEBHOOKS | Desactivado | (ninguna) |

## Arquitectura

```
src/lib/integrations/
├── types.ts                 # Interfaces: IntegrationProvider, ConnectorMetadata
├── credential-crypto.ts     # AES-256-GCM encrypt/decrypt
├── registry.ts              # Provider map + CONNECTOR_CATALOG
├── index.ts                 # Re-exports
└── disabled/
    ├── gps.ts               # DisabledGpsProvider
    ├── whatsapp.ts          # DisabledWhatsAppProvider
    ├── crm.ts               # DisabledCrmProvider
    ├── billing.ts           # DisabledBillingProvider
    └── ai.ts                # DisabledAiProvider
```

## Modelo de datos

- **IntegrationConnector**: Catalogo global (tipo, nombre, version, logo)
- **TenantIntegration**: Relacion tenant ↔ conector con estado y configuracion JSON
- **IntegrationCredential**: Credenciales cifradas (encryptedValue, iv, authTag)
- **IntegrationEvent**: Log de eventos por integracion

## Cifrado de credenciales

Variable de entorno: `INTEGRATION_ENCRYPTION_KEY` (64 hex chars = 32 bytes)

```typescript
encryptCredential(plaintext) → { encryptedValue, iv, authTag }
decryptCredential(encryptedValue, iv, authTag) → string
```

- Algoritmo: AES-256-GCM
- IV: 12 bytes aleatorios por operacion
- AuthTag: 16 bytes de autenticacion

## Agregar un proveedor real

1. Crear `src/lib/integrations/providers/gps-real.ts` implementando `IntegrationProvider`
2. Registrar en `registry.ts` reemplazando el disabled provider
3. Agregar tests de integracion con mock del API externo
4. Documentar credenciales necesarias en `.env.example`
5. Actualizar `CONNECTOR_CATALOG` si se agregan campos de configuracion

## Seguridad

- Credenciales nunca en texto plano en la base de datos
- Providers desactivados no hacen HTTP externo (verificado en security:check)
- Cada tenant tiene sus propias credenciales aisladas
- El registry no expone funciones de decrypt — solo el backend las usa
