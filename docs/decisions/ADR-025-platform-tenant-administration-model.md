# ADR-025: Modelo de Administracion Plataforma y Tenant

**Estado:** Aceptada
**Fecha:** 2026-07-12

## Contexto

La evolucion de la plataforma de torre de control hacia un producto SaaS requiere dos niveles de administracion:
1. **Plataforma**: El dueno del software gestiona todos los tenants, planes, integraciones, feedback y metricas globales
2. **Tenant**: El propietario de cada empresa gestiona sus usuarios, conductores, invitaciones, integraciones locales y feedback

## Decision

### Panel del dueno del software (`/platform/*`)

Protegido por `requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"])`.

| Ruta | Funcion |
|------|---------|
| `/platform` | Dashboard con metricas globales, CRUD de tenants, modo soporte |
| `/platform/tenants` | Lista detallada de tenants con metricas |
| `/platform/plans` | Gestion de planes (solo SUPER_ADMIN) |
| `/platform/feedback` | Feedback de todos los tenants |
| `/platform/recommendations` | Recomendaciones IA globales |
| `/platform/errors` | Alertas operativas y jobs fallidos |
| `/platform/integrations` | Catalogo de conectores y estado |
| `/platform/system-status` | Dashboard de salud del sistema |

### Panel del tenant owner (`/t/[slug]/admin/*`)

Protegido por `requireTenantRole(slug, ["TENANT_OWNER", "TENANT_ADMIN"])` (algunas sub-paginas admiten OPERATIONS_MANAGER).

| Ruta | Funcion |
|------|---------|
| `/t/[slug]/admin` | Dashboard con metricas del tenant |
| `/t/[slug]/admin/users` | Gestion de miembros y roles |
| `/t/[slug]/admin/drivers` | Lista de conductores |
| `/t/[slug]/admin/invitations` | Invitaciones con formulario de envio |
| `/t/[slug]/admin/feedback` | Envio de feedback con formulario |
| `/t/[slug]/admin/integrations` | Estado de conectores del tenant |
| `/t/[slug]/admin/recommendations` | Recomendaciones IA del tenant |
| `/t/[slug]/admin/activity` | Log de auditoria del tenant |

### Modelo de permisos de tenant

`src/lib/server/tenant-permissions.ts` define 15 permisos granulares mapeados a roles:

```
tenant.view, tenant.settings.manage,
tenant.users.manage, tenant.users.invite,
tenant.drivers.manage, tenant.drivers.view,
tenant.trips.manage, tenant.trips.view,
tenant.feedback.submit, tenant.feedback.view,
tenant.integrations.manage, tenant.integrations.view,
tenant.ai.view, tenant.ai.manage,
tenant.activity.view
```

### Invitaciones

- Token hasheado con SHA-256 (token en email, hash en DB)
- Expiracion 72 horas
- Envio via Mailpit (SMTP local)
- Roles invitables: TENANT_ADMIN, OPERATIONS_MANAGER, DISPATCHER, SAFETY_MANAGER, DRIVER
- Auditado en AuditLog

### Navegacion compartida

- `getPlatformNavGroups()` en `src/lib/ui/platform-nav.tsx`
- `getTenantAdminNavGroups(slug)` en `src/lib/ui/tenant-admin-nav.tsx`
- Reutilizados en todas las sub-paginas para consistencia

## Consecuencias

### Positivas
- Separacion clara entre administracion de plataforma y de tenant
- Todos los datos server-side, nunca se confia en el navegador para tenantId o rol
- Permisos granulares preparados para RBAC mas fino
- Invitaciones seguras con tokens hasheados

### Negativas
- Formularios de creacion de tenant son basicos (no wizard multi-paso)
- No hay edicion in-line de roles o estado de usuario todavia
- La gestion de planes es solo lectura

## Referencias

- `src/app/platform/` — paginas del panel de plataforma
- `src/app/t/[tenantSlug]/admin/` — paginas del panel de tenant
- `src/lib/server/tenant-permissions.ts` — modelo de permisos
- `src/lib/server/invitation-actions.ts` — flujo de invitaciones
