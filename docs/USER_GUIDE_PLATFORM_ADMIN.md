# Guia del Administrador de Plataforma

## Rol: PLATFORM_SUPER_ADMIN / PLATFORM_SUPPORT

El administrador de plataforma gestiona todos los tenants, planes, usuarios globales,
integraciones y el estado del sistema.

## Acceso

1. Ingresar a `http://localhost:3000` con credenciales de plataforma.
2. Si tiene MFA habilitado, ingresar el codigo TOTP.
3. Accede al panel en `/platform`.

## Funciones principales

### Gestion de tenants (`/platform/tenants`)

- **Crear tenant**: Boton "Crear tenant" en la esquina superior derecha. Complete nombre, slug, plan, pais, moneda y datos de contacto.
- **Editar tenant**: Click en el nombre del tenant para ver detalle, luego "Editar".
- **Cambiar estado**: Desde la pagina de detalle, use el selector de estado (ACTIVE, SUSPENDED, ARCHIVED, CANCELLED).
- **Cambiar plan**: Desde la pagina de detalle, use el selector de plan.
- **Buscar**: Use la barra de busqueda para filtrar por nombre o slug. Filtre por estado o plan.

### Gestion de planes (`/platform/plans`)

- Vista de todos los planes con limites (usuarios, conductores, vehiculos, clientes, documentos).
- Muestra cuantos tenants usan cada plan.

### Feedback global (`/platform/feedback`)

- Ver todo el feedback de todos los tenants con filtros por estado y tipo.
- Hacer click en un feedback para ver detalle, responder oficialmente, cambiar estado o agregar comentarios internos.
- Los comentarios internos solo son visibles para el equipo de plataforma.

### Integraciones (`/platform/integrations`)

- Vista consolidada de todas las integraciones configuradas por todos los tenants.
- Muestra conteo de credenciales y eventos por integracion.

### Recomendaciones IA (`/platform/recommendations`)

- Vista de todas las recomendaciones generadas por el motor IA para todos los tenants.

### Estado del sistema (`/platform/system-status`)

- Salud de servicios (base de datos, ClamAV, almacenamiento, jobs).
- Metricas del sistema.
- Requiere MFA activo.

### Errores (`/platform/errors`)

- Registro de errores de la aplicacion.

### Modo demo

- Para crear un tenant demo, use la accion `seedDemoTenantAction` desde el panel de plataforma.
- El tenant demo incluye: 4 usuarios, 2 conductores, 2 vehiculos, 2 clientes, 3 viajes, 3 ubicaciones.
- Credenciales demo: `owner@demo.nci.local` / `Demo2024!`
- Para reiniciar: `resetDemoTenantAction` elimina completamente el tenant demo y sus datos.

## Seguridad

- Todas las acciones quedan registradas en el log de auditoria.
- No se puede eliminar un tenant activo directamente — primero cambiar estado.
- Solo PLATFORM_SUPER_ADMIN puede crear tenants y gestionar planes.
- PLATFORM_SUPPORT puede ver feedback y responder.
