# PROJECT MEMORY

## Producto

Nombre provisional: NCI LOGISTICS CONTROL TOWER.

Nombre corto: LOGISTICS CONTROL TOWER.

Propietario tecnologico: NCI Automation.

## Objetivo

Construir una plataforma logistica SaaS multicliente para operar tenants de transporte y sus clientes finales. El prototipo corre localmente en `http://localhost:3000`.

## Modelo multicliente

Niveles:

1. NCI Automation como propietario de plataforma.
2. Tenant logistico o transportista.
3. Cliente final del tenant mediante portal.

Toda entidad operativa debe pertenecer a un `tenant_id`. Cuando aplica visibilidad de cliente, tambien usa `customer_account_id`.

## Actores

Roles de plataforma: `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`.

Roles de tenant: `TENANT_OWNER`, `TENANT_ADMIN`, `OPERATIONS_MANAGER`, `DISPATCHER`, `SAFETY_MANAGER`, `DRIVER`.

Roles de cliente: `CUSTOMER_ADMIN`, `CUSTOMER_VIEWER`.

## Restricciones estables

- Localhost y Docker local.
- PostgreSQL local mediante Docker.
- MinIO local para archivos.
- Mailpit local para correo.
- Next.js App Router, React, TypeScript estricto, Prisma, Zod, Vitest, Playwright.
- No Supabase, Vercel, Firebase, AWS, Azure ni Google Cloud para flujo principal.
- No datos reales de Panatruck.
- Panatruck Demo es solo tenant demo.

## Arquitectura aprobada

Monolito modular con Next.js App Router, Prisma y servicios centralizados de autorizacion multitenant.

## Operaciones IA (fase 11)

- Estimacion de rutas: disabled (default) / simulated (Haversine) / google (Routes API v2).
- Motor de recomendacion de conductores: reglas deterministas, 12 criterios, sin IA externa.
- Horarios de conductores: semanal + excepciones de disponibilidad.
- Dashboard de insights operativos para tenant admin.
- Google API key sanitizada en errores, nunca logueada.
- Override de recomendacion exige razon obligatoria.
- Waze preparado como stub, sin codigo muerto.

## Funciones excluidas por ahora

- Cobro real de suscripciones.
- Pasarelas de pago.
- Facturacion automatica.
- Integraciones reales con WhatsApp, email externo o telemetria.
- Sensores, valvulas o automatizacion fisica de carga/descarga.
- IA externa generativa (OpenAI, Anthropic, etc.).
- GPS real, Waze real.
