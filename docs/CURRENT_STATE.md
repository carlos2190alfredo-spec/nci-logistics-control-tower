# CURRENT STATE

Fecha: 2026-07-09

## Fase actual

Fase operacional E2E validada + rediseño visual integral aplicado. La plataforma conserva el flujo completo cliente → operaciones → conductor → evidencia → POD → cierre sobre servicios Docker locales, ahora con sistema de diseño propio, navegación por perfil, estados en español y animaciones accesibles.

## Implementado

- Next.js App Router con TypeScript estricto.
- Docker Compose para PostgreSQL (host 5433), MinIO y Mailpit.
- Prisma schema multitenant con migraciones aplicadas y seed idempotente.
- Sesiones opacas locales con cookie httpOnly y guards de autorización en servidor.
- Flujo operacional completo con asignaciones, incidencias, evidencia, firma, POD PDF y cierre.
- **Sistema de diseño** (`docs/DESIGN_SYSTEM.md`): tokens semánticos CSS con Tailwind 4 `@theme`, tipografía Geist local (paquete `geist`), iconografía Lucide, componentes UI en `src/components/ui/` (SubmitButton con estado de carga, StatusBadge, MetricCard, DataTable, Timeline, EmptyState, Skeleton, Alert, PageHeader, Collapsible, DocumentCard, TenantBrandingProvider).
- **Shells por perfil** (`src/components/shell/`): sidebar colapsable persistente + drawer móvil + topbar (plataforma/tenant/portal) y DriverShell móvil-primero con indicador real de conectividad.
- **Estados del dominio en español** (`src/lib/ui/status.ts`): etiqueta + tono por enum; formularios envían `value=enum`.
- **Centro de control rediseñado**: métricas operativas accionables, mapa de seguimiento, panel de solicitudes/incidencias/actividad, tarjetas de viaje con acciones contextuales al estado (asignar/avanzar/incidencia/aprobar o **rechazar evidencia con motivo**), historial separado de viajes cerrados.
- **Portal cliente rediseñado**: formulario de solicitud por secciones, línea de tiempo visual, documentos con tarjetas descargables, branding del tenant vía `TenantBrandingProvider`.
- **PWA conductor rediseñada**: siguiente acción dominante, evidencia solo en estados de entrega, firma en blanco con hint, alto contraste.
- Páginas 404/error diseñadas, `loading.tsx` con skeletons por ruta.
- Animaciones CSS con `prefers-reduced-motion` (`docs/ANIMATION_GUIDELINES.md`); sin librería de animación (ADR-006).
- Scripts de verificación visual: `scripts/capture-screenshots.ts` (7 vistas × 4 viewports + detección de errores de consola) y `scripts/a11y-motion-check.ts`.

## Funciona verificado (2026-07-09, post-rediseño)

- `pnpm verify` completo: lint (0 warnings), TypeScript, 5 unit tests, build.
- `pnpm test:e2e`: **10/10** (login/logout, rutas, aislamiento multitenant, aislamiento por cliente, restricción de conductor, flujo operacional completo con POD).
- Reduced motion, navegación por teclado, focus visible y ausencia de scroll horizontal a 375 px verificados por script.
- 0 errores de consola en las rutas principales a 375/768/1280/1440 px.
- PostgreSQL, MinIO y Mailpit saludables.

## Configuración local confirmada

- PostgreSQL publicado en `localhost:5433` (5432 ocupado por otro servicio local); puerto interno 5432.
- `src/generated/prisma` contiene artefactos de dos generadores (preexistente): el cliente JS activo y archivos TS antiguos que sirven tipos por subruta (`/enums`); los tipos nuevos se importan desde la raíz.

## Riesgos actuales

- PWA offline/IndexedDB sigue básico (pendiente de fase previa).
- POD PDF usa `pdfkit.standalone` con constancia textual de firma (pendiente de fase previa).
- Advertencia no bloqueante de Turbopack por trazado de Prisma en build.
- Las corridas E2E fallidas dejan viajes activos acumulados; la lista operativa admite 30. Si se acumulan demasiados, ejecutar `pnpm db:reset` (destructivo local) o cerrar viajes desde la UI.

## Ultima verificacion

Ver `docs/VERIFICATION_LATEST.md` (2026-07-09): verify + 10 E2E + a11y/motion + screenshots sin errores de consola.
