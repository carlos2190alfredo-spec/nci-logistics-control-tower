# Guia del Portal del Cliente (CUSTOMER_ADMIN / CUSTOMER_VIEWER)

## Acceso

1. Ingresar a `http://localhost:3000` con credenciales de cliente.
2. Accede al portal en `/t/{slug}/portal`.

## Funciones

### Ver solicitudes

- Lista de solicitudes de servicio creadas por la cuenta del cliente.
- Filtrar por estado.
- Ver detalle de cada solicitud.

### Crear solicitud de servicio

- Seleccionar tipo de servicio.
- Ingresar origen, destino, fecha solicitada, prioridad.
- Agregar detalles de carga y notas.
- La solicitud queda en estado REQUESTED hasta que operaciones la procese.

### Seguimiento de viajes

- Ver estado actualizado de los viajes asociados a sus solicitudes.
- El estado visible al cliente muestra mensajes amigables (no codigos internos).
- Ver incidencias registradas durante el viaje.

### Documentos

- Ver documentos autorizados para la cuenta del cliente.
- Descargar POD (Proof of Delivery) una vez generado.
- Solo documentos con acceso autorizado son visibles.

## Restricciones

- **CUSTOMER_VIEWER**: Solo puede ver solicitudes y documentos, no crear.
- **CUSTOMER_ADMIN**: Puede crear solicitudes y gestionar contactos.
- No tiene acceso a datos de otros clientes ni al panel de administracion del tenant.
