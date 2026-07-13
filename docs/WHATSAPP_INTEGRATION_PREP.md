# Preparacion de Integracion WhatsApp

## Estado: PREPARADO (Disabled-First)

El conector WhatsApp esta registrado en el catalogo con un provider desactivado. No envia mensajes ni hace llamadas al API de Meta.

## Modelo de datos listo

- `IntegrationConnector` con type=WHATSAPP en el catalogo
- `TenantIntegration` para activacion por tenant
- `IntegrationCredential` para accessToken cifrado
- `IntegrationEvent` para log de entregas

## Configuracion preparada

| Campo | Tipo | Requerido |
|-------|------|-----------|
| phoneNumberId | string | Si |

## Credenciales requeridas

| Clave | Descripcion |
|-------|-------------|
| accessToken | Token de acceso permanente de WhatsApp Business Cloud API |

## Para activar

1. Implementar `WhatsAppProvider` en `src/lib/integrations/providers/whatsapp.ts`
2. Implementar metodos:
   - `testConnection(config)`: Verificar token y phone number ID
   - `execute('sendTemplate', { to, templateName, params })`: Enviar mensaje de plantilla
   - `execute('sendText', { to, text })`: Enviar mensaje de texto
3. Configurar webhook para recibir actualizaciones de estado de entrega
4. Agregar `WHATSAPP_VERIFY_TOKEN` a `.env.example`
5. Registrar en el registry reemplazando `DisabledWhatsAppProvider`

## Casos de uso preparados

- Notificacion al conductor de viaje asignado
- Notificacion al cliente de viaje en transito
- Notificacion al cliente de entrega completada
- Alerta al operador de incidente reportado

## Notas de seguridad

- El access token se cifra con AES-256-GCM
- No se activa WhatsApp real sin credenciales reales del Business API
- Los templates deben estar aprobados por Meta antes de enviar
- Rate limiting del API de Meta: respetar limites por tipo de mensaje
