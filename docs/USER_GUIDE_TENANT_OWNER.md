# Guia del Propietario de Tenant (TENANT_OWNER)

## Acceso

1. Ingresar a `http://localhost:3000` con sus credenciales.
2. Si tiene MFA habilitado, ingresar el codigo TOTP.
3. Accede al centro de control en `/t/{slug}`.
4. Accede a la administracion en `/t/{slug}/admin`.

## Administracion del tenant

### Panel de administracion (`/admin`)

- **Checklist de configuracion**: Si el tenant es nuevo, vera un checklist con los pasos
  pendientes (agregar usuarios, registrar conductores, configurar integraciones, activar
  motor IA, crear primer viaje). Cada paso enlaza directamente a la accion correspondiente.
- **Metricas**: Miembros activos, conductores, viajes totales, feedback enviado, invitaciones pendientes.
- **Recursos**: Vehiculos, clientes, tipos de servicio, integraciones configuradas.
- **Inteligencia**: Estado del motor IA, feedback enviado, indicador de tenant demo.

### Usuarios (`/admin/users`)

- Ver, crear y editar miembros del tenant.
- Roles disponibles: TENANT_OWNER, TENANT_ADMIN, OPERATIONS_MANAGER, DISPATCHER, SAFETY_MANAGER, DRIVER.
- Activar/desactivar membresías.

### Conductores (`/admin/drivers`)

- Registrar conductores con codigo, nombre, telefono, licencia.
- Vincular un conductor a un usuario existente para acceso a la PWA.
- Editar datos y estado del conductor.

### Invitaciones (`/admin/invitations`)

- Ver invitaciones pendientes y usadas.
- Crear nuevas invitaciones para agregar usuarios por correo.

### Integraciones (`/admin/integrations`)

- Ver conectores disponibles (GPS, WhatsApp, CRM, Facturacion, Email, IA, Webhooks).
- Configurar parametros y credenciales por conector.
- Las credenciales se almacenan cifradas con AES-256-GCM.
- Habilitar/deshabilitar integraciones (por defecto todas desactivadas).
- Probar conexion (genera evento simulado).

### Seguridad (`/admin/security`)

- Ver porcentaje de adopcion MFA en el tenant.
- Estado MFA por usuario.
- Ultimos 10 eventos de auditoria.

### Feedback (`/admin/feedback`)

- Enviar feedback a la plataforma (tipo: BUG, FEATURE_REQUEST, QUESTION, COMPLAINT, PRAISE).
- Ver estado de feedback enviado.
- Agregar comentarios a feedback existente.

### Recomendaciones IA (`/admin/recommendations`)

- Ver recomendaciones generadas por el motor basado en reglas.
- Activar/desactivar el motor IA.
- Generar recomendaciones manualmente.
- Actuar o descartar recomendaciones individuales.

### Actividad (`/admin/activity`)

- Registro de actividad del tenant.

## Centro de control (`/t/{slug}`)

- Solicitudes de servicio con estados.
- Viajes activos con progreso.
- Incidencias.
- Vista general de la operacion.

## Configuracion (`/t/{slug}/settings`)

- Identidad visual (wordmark, colores, textos).
- Plan y limites de uso.
- Funciones habilitadas.
