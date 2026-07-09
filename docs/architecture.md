# Architecture

La aplicacion es un monolito modular con Next.js App Router.

Capas principales:

- `src/app`: rutas, paginas y route handlers.
- `src/components`: componentes UI reutilizables.
- `src/lib/server`: DB, auth, auditoria y server actions.
- `src/lib/domain`: reglas puras como maquina de estados y GPS demo.
- `src/lib/providers`: contratos/adaptadores locales de notificacion.
- `prisma`: schema, migraciones y seed.

La base de datos usa PostgreSQL con UUID. Las entidades operativas llevan `tenant_id`; las entidades visibles por cliente llevan tambien `customer_account_id`.

La autorizacion se concentra en funciones server-side y no se deriva de roles enviados por el cliente.
