# CURRENT STATE

Fecha: 2026-07-09

## Fase actual

Fase operacional E2E validada en runtime local: base Next.js, infraestructura local, modelo multitenant, autenticacion local, UI principal, migraciones, seed y flujo completo cliente -> operaciones -> conductor -> evidencia -> POD -> cierre ejecutados contra servicios Docker reales.

## Implementado

- Next.js App Router con TypeScript estricto.
- Docker Compose para PostgreSQL, MinIO, Mailpit y app opcional.
- Prisma schema multitenant con migracion inicial SQL.
- Sesiones opacas locales con cookie httpOnly.
- Utilidades `requireAuthenticatedUser`, `requirePlatformRole`, `requireTenantMembership`, `requireTenantRole`, `requireCustomerMembership`, `resolveActiveTenant`, `assertTenantEntityAccess`, `assertCustomerEntityAccess`.
- Panel `/platform`.
- Centro de control `/t/[tenantSlug]`.
- Portal cliente `/t/[tenantSlug]/portal`.
- PWA conductor inicial `/t/[tenantSlug]/driver`.
- Configuracion `/t/[tenantSlug]/settings`.
- Creacion de solicitud de cliente con datos de contenedor, prioridad, contacto e idempotencia servidor.
- Conversion de solicitud a viaje, asignacion de unidad/equipo/conductor con bitacora de asignaciones y ventana anti-conflicto.
- Avance conductor por maquina de estados, incidencia visible al cliente, evidencia con upload a MinIO y firma digital capturada.
- Aprobacion operacional de evidencia, generacion de POD PDF, documento customer-visible y cierre de viaje.
- Descarga de POD y documentos autorizados mediante signed URLs de MinIO.
- Seed idempotente definido para Panatruck Demo y TransLogistica Demo.
- Pruebas unitarias de maquina de estados y GPS.

## Funciona verificado

- `pnpm verify` paso completo: lint, TypeScript, unit tests y build.
- `pnpm exec prisma generate` paso.
- `pnpm exec prisma validate` paso.
- Docker daemon activo.
- PostgreSQL, MinIO y Mailpit saludables.
- Migraciones aplicadas: `20260709101000_initial_multitenant_foundation`, `20260709155859_end_to_end_service_workflow`, `20260709160400_service_request_idempotency_key`.
- Bucket MinIO `nci-logistics-local` creado.
- Seed ejecutado dos veces y validado como idempotente en claves criticas.
- Datos reales en PostgreSQL: 2 tenants activos; Panatruck Demo y TransLogistica Demo con clientes, vehiculos, conductores y viajes reales. Las ejecuciones E2E agregan datos operativos y documentos de POD en Panatruck.
- E2E Playwright paso con 10 pruebas: login, logout, rutas principales, aislamiento multitenant, aislamiento por cliente, visibilidad de conductor asignado y flujo operacional completo.
- Mailpit recibio correo de prueba.
- MinIO acepto archivo demo bajo prefijo `tenants/panatruck-demo/...` y nego acceso publico sin firma con HTTP 403.
- No hubo errores criticos de consola en pasada headless de rutas principales.

## Configuracion local confirmada

- PostgreSQL del proyecto publica en `localhost:5433` porque `localhost:5432` estaba ocupado por otro servicio local.
- Puerto interno del contenedor PostgreSQL sigue siendo `5432`.

## Riesgos actuales

- El PWA offline/IndexedDB esta preparado de forma basica, no como cola robusta completa.
- El PDF usa `pdfkit/js/pdfkit.standalone` para compatibilidad con Turbopack; la firma se conserva como evidencia digital y el POD registra constancia textual de captura.
- Build pasa con advertencia no bloqueante de Turbopack por trazado dinamico de Prisma.

## Ultima verificacion

`docker compose ps`, `pnpm db:seed` dos veces, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` y `pnpm verify` pasaron el 2026-07-09. Servicios Docker saludables.
