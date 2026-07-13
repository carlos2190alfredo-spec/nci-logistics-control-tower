# Guia del Conductor (DRIVER)

## Acceso

1. Abrir `http://localhost:3000` en el navegador del dispositivo movil.
2. Instalar como PWA (Agregar a pantalla de inicio).
3. Ingresar con sus credenciales.
4. Accede a la vista de conductor en `/t/{slug}/driver`.

## Funciones

### Ver viajes asignados

- Lista de viajes asignados al conductor con estado y destino.
- Detalle de cada viaje: origen, destino, cliente, tipo de servicio.

### Avanzar estados del viaje

Los estados se avanzan secuencialmente:
1. **ASSIGNED** → En ruta al punto de recogida.
2. **EN_ROUTE_TO_PICKUP** → Llegada al punto de recogida.
3. **AT_PICKUP** → Carga completada, inicio del transito.
4. **IN_TRANSIT** → Llegada al punto de entrega.
5. **AT_DELIVERY** → Entrega realizada.
6. **DELIVERED** → Completado (requiere aprobacion de operaciones).

### Registrar incidencias

- Crear incidencias durante cualquier punto del viaje.
- Categorias disponibles: accidente, demora, dano, mecanico, etc.
- Las incidencias son visibles para operaciones y el cliente.

### Tomar fotos de evidencia

- Capturar fotos como evidencia de entrega.
- Las fotos se procesan offline: se almacenan en IndexedDB hasta sincronizar.
- Datos EXIF se eliminan automaticamente por privacidad.
- Las fotos pasan por escaneo antivirus antes de estar disponibles.

### Firma de recepcion

- Capturar firma digital del receptor.
- La firma se embebe en el PDF de prueba de entrega.

## Funcionamiento offline

- La PWA funciona sin conexion a internet.
- Las acciones (cambio de estado, fotos, incidencias) se encolan localmente.
- Al recuperar conexion, se sincronizan automaticamente.
- Un indicador visual muestra el estado de conexion y acciones pendientes.
- Las fotos pendientes se muestran en el panel de sincronizacion.

## Seguridad

- Todas las acciones requieren autenticacion.
- Las fotos se escanean con ClamAV antes de ser aceptadas.
- Solo se puede acceder a viajes asignados al conductor.
