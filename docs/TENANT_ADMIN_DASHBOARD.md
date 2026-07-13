# Panel de Administracion del Tenant

## Acceso

Ruta base: `/t/[tenantSlug]/admin`
Roles requeridos: `TENANT_OWNER` o `TENANT_ADMIN` (algunas paginas admiten `OPERATIONS_MANAGER`)

## Paginas

### Dashboard (`/t/[slug]/admin`)
- 5 metricas: miembros activos, conductores, viajes totales, feedback enviado, invitaciones pendientes

### Usuarios (`/t/[slug]/admin/users`)
- Lista de miembros con nombre, correo, rol (en espanol), estado activo/inactivo, ultimo acceso

### Conductores (`/t/[slug]/admin/drivers`)
- Roles: TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER
- Lista con nombre, codigo, licencia, estado, usuario vinculado, viajes

### Invitaciones (`/t/[slug]/admin/invitations`)
- Tabla de invitaciones pendientes (correo, rol, invitado por, expiracion)
- Formulario de nueva invitacion (correo + rol)
- Roles invitables: Administrador, Gerente operaciones, Despachador, Gerente seguridad, Conductor
- Token SHA-256 hasheado en DB, TTL 72 horas, envio via Mailpit

### Feedback (`/t/[slug]/admin/feedback`)
- Roles: TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER
- Historial de feedback enviado con tipo, titulo, estado, reportado por, fecha
- Formulario de nuevo feedback (tipo, titulo, descripcion)
- Tipos: Bug, Solicitud de funcionalidad, UX, Rendimiento, Integracion, Otro

### Integraciones (`/t/[slug]/admin/integrations`)
- Catalogo de conectores con estado de activacion en el tenant
- Integraciones activas con detalle de habilitacion y ultima actualizacion

### Recomendaciones IA (`/t/[slug]/admin/recommendations`)
- Roles: TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER
- Metricas: total, pendientes, actuadas
- Historial con tipo, prioridad, titulo, estado, fecha

### Actividad (`/t/[slug]/admin/activity`)
- Log de auditoria: ultimas 50 acciones
- Campos: accion, entidad, usuario, rol, fecha/hora

## Navegacion

Gestionada por `getTenantAdminNavGroups(tenantSlug)` en `src/lib/ui/tenant-admin-nav.tsx`. Secciones:
- Resumen
- Personas (Usuarios, Conductores, Invitaciones)
- Configuracion (Integraciones, Seguridad)
- Inteligencia (Feedback, Recomendaciones, Actividad)

## Modelo de permisos

15 permisos granulares en `src/lib/server/tenant-permissions.ts` mapeados a 6 roles de tenant.
