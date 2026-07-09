# NCI Logistics Control Tower

Plataforma logistica multitenant local propiedad de NCI Automation. Panatruck Demo y TransLogistica Demo son tenants ficticios para demostrar aislamiento, flujos operativos y branding configurable.

## Arquitectura

- Next.js App Router, React y TypeScript estricto.
- PostgreSQL local con Prisma.
- MinIO local para documentos.
- Mailpit local para correo.
- Sesiones opacas locales con Argon2id.
- Monolito modular: `src/app`, `src/lib/server`, `src/lib/domain`, `src/lib/providers`.

## Requisitos

- Node.js compatible con Next 16.
- pnpm 11.
- Docker Desktop corriendo.

## Inicio rapido

```bash
pnpm setup:local
pnpm dev
```

Abrir `http://localhost:3000`.

Si Docker ya esta corriendo pero quieres hacerlo paso a paso:

```bash
pnpm local:up
pnpm storage:init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Docker completo

```bash
docker compose --profile app up -d
```

Servicios:

- App: `http://localhost:3000`
- PostgreSQL: `localhost:5433` por defecto en desarrollo local (`POSTGRES_HOST_PORT`) para evitar conflictos con otros Postgres locales.
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`

## Variables

Copiar o revisar `.env.example`. En desarrollo local existe `.env.local` con credenciales demo.

## Credenciales demo

- Plataforma: `platform@nci.local` / `NCIPlatform2026!`
- Owner Panatruck: `owner@panatruck.local` / `PanatruckOwner2026!`
- Operaciones Panatruck: `operaciones@panatruck.local` / `Operaciones2026!`
- Despacho Panatruck: `despacho@panatruck.local` / `Despacho2026!`
- Conductor Panatruck: `conductor1@panatruck.local` / `Conductor2026!`
- Cliente Panatruck: `cliente@clienteportuario.local` / `Cliente2026!`
- Owner TransLogistica: `owner@translogistica.local` / `TransLogistica2026!`
- Cliente TransLogistica: `cliente@distribuciones.local` / `Distribuciones2026!`

Estas contrasenas son exclusivas de demostracion.

## Rutas

- `/platform`: panel NCI Automation.
- `/t/panatruck-demo`: centro de control tenant.
- `/t/panatruck-demo/portal`: portal cliente.
- `/t/panatruck-demo/driver`: PWA conductor inicial.
- `/t/panatruck-demo/settings`: configuracion.

Tambien existe `/t/translogistica-demo`.

## Scripts

- `pnpm setup:local`: instala, levanta servicios, inicializa storage, migra y siembra.
- `pnpm local:up`: levanta Postgres, MinIO y Mailpit.
- `pnpm local:down`: detiene servicios.
- `pnpm local:logs`: logs.
- `pnpm local:reset`: elimina volumenes y reinicia servicios.
- `pnpm db:migrate`: aplica migraciones.
- `pnpm db:seed`: carga datos demo.
- `pnpm db:reset`: reinicia DB y seed.
- `pnpm db:studio`: Prisma Studio.
- `pnpm storage:init`: crea bucket MinIO.
- `pnpm backup:create`: crea dump PostgreSQL.
- `pnpm backup:restore backups/file.sql`: restaura dump.
- `pnpm verify`: lint, typecheck, unit tests y build.
- `pnpm test:e2e`: Playwright.

## Backups

```bash
pnpm backup:create
pnpm backup:restore backups/nci-logistics-YYYYMMDD-HHMMSS.sql
```

## Limitaciones actuales

- Docker no pudo verificarse durante la sesion inicial porque el daemon no estaba corriendo.
- El flujo offline IndexedDB del conductor esta preparado solo como PWA base; la cola robusta queda pendiente.
- Upload real a MinIO desde UI queda pendiente.
- E2E completo y pruebas de aislamiento contra DB real quedan pendientes hasta levantar Docker.

## Protocolo de continuidad

Antes de trabajar, leer:

- `AGENTS.md`
- `docs/PROJECT_MEMORY.md`
- `docs/CURRENT_STATE.md`
- `docs/HANDOFF_LATEST.md`
- `docs/VERIFICATION_LATEST.md`
- `docs/decisions/`

Al terminar, actualizar memoria, handoff, session log y verificacion.
