# Tenant Isolation

## Modelo

El tenant activo se resuelve desde la ruta `/t/[tenantSlug]` y se valida contra la sesion y membresia del usuario.

## Controles

- `requireTenantMembership()`
- `requireTenantRole()`
- `requireCustomerMembership()`
- `assertTenantEntityAccess()`
- `assertCustomerEntityAccess()`

## Patrones permitidos

- Consultas con `where: { tenantId: tenant.id }`.
- Consultas cliente con `where: { tenantId, customerAccountId }`.
- Server actions que reciben IDs de entidad, no `tenant_id` autorizado por formulario.

## Patrones prohibidos

- `prisma.trip.findMany()` en contexto tenant sin filtro `tenantId`.
- Aceptar `tenant_id` libre desde formularios.
- Mostrar comentarios internos al portal cliente.
- Devolver datos de otro tenant para diferenciar existencia.

## Casos de prueba pendientes

## Casos de prueba automatizados

- Tenant A no accede a POD de Tenant B.
- Cliente A no accede a POD de Cliente B dentro del mismo tenant.
- Driver no accede a viaje no asignado.
- Cliente solo ve documentos `CUSTOMER_VISIBLE` dentro de su `tenantId` y `customerAccountId`.
