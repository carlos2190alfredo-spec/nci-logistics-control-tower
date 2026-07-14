# Horarios de Conductores

## Modelo

### DriverWorkSchedule
Horario semanal recurrente por conductor:
- `dayOfWeek`: MONDAY..SUNDAY
- `startTimeLocal` / `endTimeLocal`: formato HH:MM (validado con regex)
- `breakStartLocal` / `breakEndLocal`: descanso opcional
- `isActive`: permite desactivar sin eliminar

### DriverAvailabilityException
Excepciones puntuales por fecha:
- `date`: fecha de la excepcion
- `type`: DAY_OFF | VACATION | SICK_LEAVE | EXTRA_SHIFT | CUSTOM_UNAVAILABLE
- `reason`: texto libre opcional
- `startTimeLocal` / `endTimeLocal`: rango opcional (para excepciones parciales)

## UI

### Pagina de horario (`/t/[slug]/admin/drivers/[id]/schedule`)

1. **Metricas**: dias activos, excepciones pendientes, viajes hoy
2. **Grilla semanal**: formulario para configurar cada dia (start/end/break/activo)
3. **Tabla de excepciones**: lista con tipo, fecha, razon y boton eliminar
4. **Formulario de excepcion**: agregar nueva excepcion (tipo, fecha, razon)

### Acceso desde lista de conductores

Cada fila de conductor tiene enlace "Horario" junto a "Editar".

## Server actions

- `saveDriverScheduleAction`: reemplaza horario completo del conductor
- `addAvailabilityExceptionAction`: agrega excepcion puntual
- `deleteAvailabilityExceptionAction`: elimina excepcion

Todas validan:
- Driver pertenece al tenant
- Formato de hora HH:MM
- Tipo de excepcion valido
- Auditoria de cambios

## Roles

TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER pueden gestionar horarios.
