# Guia de Operaciones (OPERATIONS_MANAGER / DISPATCHER)

## Roles

- **OPERATIONS_MANAGER**: Gestion completa de operaciones, puede cambiar estados de feedback y ver recomendaciones.
- **DISPATCHER**: Despacho de viajes, asignacion de conductores y vehiculos.

## Acceso

1. Ingresar a `http://localhost:3000` con sus credenciales.
2. Accede al centro de control en `/t/{slug}`.

## Centro de control

### Solicitudes

- Ver solicitudes de servicio de los clientes.
- Filtrar por estado (DRAFT, REQUESTED, UNDER_REVIEW, CONFIRMED, REJECTED, etc.).
- Convertir solicitudes aprobadas en viajes.

### Viajes activos

- Ver todos los viajes con su estado actual.
- Estados: REQUESTED, ASSIGNED, EN_ROUTE_TO_PICKUP, AT_PICKUP, IN_TRANSIT, AT_DELIVERY, DELIVERED, COMPLETED, CANCELLED.
- Asignar vehiculo, equipo y conductor a viajes.
- Monitorear progreso de viajes en transito.

### Incidencias

- Registrar y gestionar incidencias asociadas a viajes.
- Categorias: accidente, demora, dano de carga, mecanico, etc.

### Documentos

- Gestionar documentos asociados a viajes y clientes.
- Pipeline de archivos: subida → escaneo antivirus → disponible.
- Solo archivos con estado CLEAN o AVAILABLE se incluyen en PODs.

### POD (Proof of Delivery)

- Aprobar evidencia de entrega.
- Generar PDF de prueba de entrega con fotos y firma del receptor.
- El POD se genera automaticamente cuando la evidencia es aprobada.

## Feedback

- Comentar en feedback existente del tenant.
- Cambiar estado de feedback (OPERATIONS_MANAGER).

## Recomendaciones

- Ver recomendaciones del motor IA.
- Actuar o descartar recomendaciones (OPERATIONS_MANAGER).

## PWA del conductor

- Si tiene rol DISPATCHER + DRIVER, puede acceder a la PWA del conductor.
- La PWA funciona offline: las acciones se encolan y sincronizan cuando hay conexion.
