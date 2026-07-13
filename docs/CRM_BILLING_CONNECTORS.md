# Conectores CRM y Facturacion

## Estado: PREPARADOS (Disabled-First)

Ambos conectores estan registrados en el catalogo con providers desactivados. No hacen llamadas HTTP externas.

## CRM Externo

### Configuracion

| Campo | Tipo | Requerido |
|-------|------|-----------|
| baseUrl | string | Si |

### Credenciales

| Clave | Descripcion |
|-------|-------------|
| apiKey | API key del CRM externo |

### Para activar

1. Implementar `CrmProvider` en `src/lib/integrations/providers/crm.ts`
2. Mapear entidades: Customer → Contacto CRM, Trip → Oportunidad/Orden
3. Implementar sincronizacion bidireccional o unidireccional segun el CRM
4. Agregar webhook receiver para cambios en el CRM

### CRMs compatibles (futuros)

- HubSpot
- Salesforce
- Pipedrive
- Zoho CRM

## Facturacion Electronica

### Configuracion

| Campo | Tipo | Requerido |
|-------|------|-----------|
| fiscalId | string | Si (RUC/NIT del tenant) |

### Credenciales

| Clave | Descripcion |
|-------|-------------|
| apiKey | API key del proveedor de facturacion |
| certificatePassword | Password del certificado digital |

### Para activar

1. Implementar `BillingProvider` en `src/lib/integrations/providers/billing.ts`
2. Implementar metodos:
   - `testConnection(config)`: Verificar credenciales con el SAT/SUNAT/DIAN
   - `execute('createInvoice', { tripId, items })`: Emitir factura
   - `execute('cancelInvoice', { invoiceId, reason })`: Cancelar factura
3. Manejar certificados digitales de forma segura
4. Implementar cola de reintentos para emisiones fallidas

### Proveedores compatibles (futuros)

- Facturapi (Mexico)
- SUNAT API (Peru)
- DIAN API (Colombia)
- Proveedor generico CFDI/UBL

## Seguridad compartida

- Credenciales cifradas con AES-256-GCM (misma implementacion que GPS y WhatsApp)
- No se activa ningun conector sin credenciales reales
- Datos fiscales son datos sensibles por tenant — nunca cruzar entre tenants
- Los certificados digitales requieren manejo especial de archivos (futura implementacion)
