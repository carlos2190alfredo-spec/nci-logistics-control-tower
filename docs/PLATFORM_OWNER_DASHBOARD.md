# Panel del Dueno del Software (Plataforma)

## Acceso

Ruta base: `/platform`
Roles requeridos: `PLATFORM_SUPER_ADMIN` o `PLATFORM_SUPPORT`

## Paginas

### Dashboard principal (`/platform`)
- Metricas globales: total tenants, activos, usuarios, viajes procesados
- Tabla de tenants con estado, plan, y volumenes
- Formulario de creacion de tenant (nombre, slug, plan)
- Modo soporte auditado (acceso temporal a un tenant con razon obligatoria)

### Tenants (`/platform/tenants`)
- Lista completa con nombre legal, slug, estado, plan, suscripcion
- Conteos: usuarios, clientes, viajes, feedback
- Links directos a cada tenant

### Planes (`/platform/plans`)
- Solo accesible por PLATFORM_SUPER_ADMIN
- Lista de planes con limites (maxUsers, maxDrivers, maxVehicles, maxTripsPerMonth)
- Feature flags por plan (mfa, apiAccess, customBranding, advancedReporting, prioritySupport)

### Feedback (`/platform/feedback`)
- Metricas: total, abiertos, resueltos
- Tabla con feedback de todos los tenants
- Tipo (Bug, Feature, UX, Rendimiento, Integracion) y estado

### Recomendaciones IA (`/platform/recommendations`)
- Metricas: total, pendientes, actuadas
- Recomendaciones de todos los tenants con tipo, prioridad, estado

### Errores (`/platform/errors`)
- Alertas operativas: severidad, fuente, titulo, estado, ocurrencias
- Jobs fallidos: nombre, estado, error, duracion

### Integraciones (`/platform/integrations`)
- Catalogo de 7 conectores con estado global (todos desactivados)
- Integraciones activas por tenant (si existen)

### Estado del sistema (`/platform/system-status`)
- Dashboard de salud con endpoints de health, liveness, readiness, metrics

## Navegacion

Gestionada por `getPlatformNavGroups()` en `src/lib/ui/platform-nav.tsx`. Secciones:
- Resumen
- Gestion (Tenants, Crear, Planes, Soporte)
- Inteligencia (Feedback, Recomendaciones IA, Errores)
- Integraciones (Conectores)
- Operaciones (Estado del sistema)
