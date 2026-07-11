# ADR-019: Enforcement de MFA por rol y reautenticación

Fecha: 2026-07-11
Estado: Aceptada

## Contexto

- ADR-018 establece la infraestructura TOTP. Esta decisión cubre la política de enforcement y el mecanismo de reautenticación para acciones sensibles.
- Roles privilegiados sin MFA representan el mayor riesgo de compromiso de cuenta con impacto cross-tenant.
- Acciones destructivas (eliminar datos, cambiar permisos, desactivar MFA) necesitan verificación reciente más allá de la sesión activa.

## Decisiones

1. **Roles que requieren MFA obligatorio**:
   - Plataforma: `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`
   - Tenant: `TENANT_OWNER`, `TENANT_ADMIN`
   - Los demás roles (DISPATCHER, DRIVER, customer roles) pueden activar MFA voluntariamente.

2. **Puntos de enforcement**:
   - `requirePlatformRole(roles)`: tras validar sesión y rol, verifica MFA activo. Si no existe, redirige a `/account/security/mfa/setup`.
   - `requireTenantRole(tenantSlug, roles)`: misma lógica para roles de tenant.
   - `loginAction()`: tras login exitoso, si `requiresMfaForRole()` devuelve true y el usuario no tiene MFA, redirige a setup en vez del dashboard.
   - Estas verificaciones ocurren en el servidor; el frontend solo muestra indicadores informativos.

3. **Reautenticación para acciones sensibles**:
   - `requireRecentMfaOrPasswordAction`: server action que exige MFA code o contraseña según si el usuario tiene MFA activo.
   - Ventana de 15 minutos: si existe un `MfaChallenge` completado con purpose "reauth" en los últimos 15 minutos, se acepta sin pedir código.
   - Usa `MfaChallenge` como registro de verificación reciente. Cada challenge tiene TTL de 5 minutos y máximo 5 intentos.

4. **Dashboard de seguridad** (`/account/security`):
   - Muestra estado de MFA (badge activo/inactivo).
   - Cuenta de códigos de recuperación restantes.
   - Advertencia para usuarios con roles privilegiados sin MFA.
   - Links a setup, gestión de MFA y sesiones activas.

5. **Navegación actualizada**: shells apuntan a `/account/security` en vez de `/account/sessions` directamente. Sesiones activas accesible como sub-sección.

6. **No revelación de estado MFA**: mensajes de error genéricos ("Código incorrecto") en login MFA. No se indica si un usuario tiene MFA en respuestas públicas.

## Alternativas descartadas

- **MFA obligatorio para todos los usuarios**: impone fricción innecesaria a conductores que acceden desde dispositivos compartidos. Los roles de bajo privilegio quedan voluntarios.
- **Enforcement solo en frontend**: viola la regla "permisos en el servidor". Un usuario podría navegar directamente a la URL protegida. Rechazado.
- **Reautenticación con ventana más larga (1h)**: reduce seguridad de acciones sensibles; 15 minutos equilibra UX y seguridad.

## Consecuencias

- Usuarios con roles privilegiados existentes serán redirigidos a configurar MFA al intentar acceder a sus funciones.
- La experiencia de primer uso para administradores incluye un paso adicional obligatorio.
- El campo `authLevel` en sessions permite auditar el nivel de verificación de cada sesión activa.
- La tabla `mfa_challenges` permite extensión futura: verificación de acciones específicas (eliminación de tenant, cambio de plan, etc.) sin cambios de schema.
