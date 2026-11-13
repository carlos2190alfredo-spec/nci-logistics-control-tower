# HANDOFF LATEST

## 2026-11-13 (noche) — Endurecimiento de producción (ADR-037)

- Leer `docs/decisions/ADR-037-production-readiness-audit.md` y `docs/STAGING_DEPLOYMENT.md`.
- **Pendiente del dueño** (las conexiones de Vercel/Supabase/Resend estaban desconectadas):
  1. Supabase → Storage → S3 Connection → New access key → Vercel `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`.
  2. Resend: API key solo de envío para `nciautomation.com` → Vercel `MAIL_PASSWORD`.
  3. Vercel: `CRON_SECRET` (`openssl rand -hex 32`) y `OPS_ALERT_EMAIL`. Todas Sensitive,
     Production y Preview.
  4. `APP_ENV=production` (también en build) solo cuando el sitio deba ser indexable.
- Tras definir variables: redesplegar (`git commit --allow-empty` + push) y verificar
  `/api/internal/health` en verde, una subida de evidencia y el correo de recuperación.
- Reseembrar staging (`APP_ENV=staging`, con `.env.staging.local`) para que los viajes demo con
  evidencia pendiente tengan su prueba de entrega.
- Para clientes reales: proyecto Supabase nuevo, `pnpm db:deploy`, `harden.sql`, `pnpm prod:bootstrap`,
  y retirar los datos demo con `pnpm demo:purge`.
- Programar `pnpm backup:postgres` y `backup:minio` en un equipo autorizado (nada corre solo).
- No está en el código y requiere decisión: CSP sin `unsafe-inline`, FK compuestas, imagen social.


## 2026-11-13 — Staging en la nube y rediseño (ADR-036)

- Leer `docs/STAGING_DEPLOYMENT.md` (runbook) y `docs/decisions/ADR-036-cloud-staging.md`.
- Los secretos de staging están en `.env.staging.local` (local, modo 600, ignorado por
  git). `MFA_ENCRYPTION_KEY` debe coincidir entre el seed y Vercel.
- Después de cada migración en staging, ejecutar `infra/supabase/harden.sql`.
- Correr una sola suite E2E por vez. `pnpm e2e:cleanup --apply` tras cada suite.
- **Pendiente:**
  - `flyctl auth login` (dueño) → `fly deploy` del gateway;
  - proyecto Vercel con variables;
  - clave S3 de Supabase y API key de Resend (las pega el dueño en Vercel);
  - verificación end-to-end en staging.


Fecha: 2026-11-12
Agente: Claude Opus 5.5 (auditoría + remediación P0 del núcleo operativo)

## Qué se hizo

1. **Auditoría de solo lectura del proyecto.** Encontró hallazgos P0, P1 y P2:
   - P0: flujo de viajes sin cancelación ni excepciones, `return;` silenciosos y carreras
     de concurrencia;
   - P1: sin RLS ni claves foráneas compuestas, cumplimiento enlazado por texto, estado de
     activos en texto libre, finanzas sin moneda, roles incoherentes;
   - P2: `actions.ts` monolítico, sin tests de integración con DB, crecimiento de alcance,
     documentación desincronizada.
2. **Remediación P0 (ADR-035).** Ver `docs/decisions/ADR-035-…` y `CURRENT_STATE.md`.

## Archivos clave nuevos

- `src/lib/domain/request-state-machine.ts` (+ test)
- `src/lib/server/request-actions.ts`: convertir, revisar (pedir información o rechazar) y
  acciones del cliente
- `src/lib/server/action-result.ts`, `src/components/ui/action-form.tsx`
- `prisma/migrations/20261112120000_trip_exceptions_and_request_reasons/` (aditiva)
- `tests/e2e/trip-exceptions.spec.ts`

## Contratos nuevos

- Las server actions de viaje, solicitud y evidencia devuelven `ActionResult` y se montan
  con `<ActionForm>`.
- Firma: `(tenantSlug, previous, formData)`.
- `confirmRequestAsTripAction` se movió a `request-actions.ts`.
- Botones nuevos:
  - en la tarjeta de viaje: "Aplicar excepcion";
  - en la tarjeta de solicitud: "Enviar";
  - en el portal: "Enviar respuesta", "Enviar borrador a operaciones", "Cancelar solicitud".
- Los botones existentes no cambiaron de nombre.

## Pendiente para la próxima sesión

- **Datos locales (hecho en la segunda parte de la sesión):**
  - el seed ahora refresca vencimientos de cumplimiento y fechas de contenedores al
    re-ejecutarse (antes `update: {}` los congelaba);
  - nuevo `pnpm e2e:cleanup` (dry-run por defecto, `--apply` borra): elimina viajes de
    tenants demo cuya solicitud no es del seed (`cargoDetails.demo`), con sus documentos,
    adjuntos, incidentes, recibos offline y objetos de MinIO;
  - aplicado: 295 viajes E2E borrados, quedan 10 + 5 del seed;
  - ClamAV local estaba detenido: `docker compose up -d clamav` (no está en `local:up`).
- **Pendiente:** paginar `/trips`; los E2E siguen sin limpiar lo que crean (correr
  `pnpm e2e:cleanup --apply` tras cada suite completa).
- **Helper `login` (hecho):** `tests/e2e/helpers/auth.ts` es el único helper; las specs
  nuevas deben importarlo. Suite completa 103/103 sin reintentos desde DB limpia.
- **P1 de la auditoría:**
  - RLS o claves foráneas compuestas;
  - enlaces por UUID;
  - enum de estado de activos;
  - ventana de conflicto basada en la duración y los horarios del conductor;
  - moneda en finanzas;
  - matriz de roles central.
- **Conductor declarando entrega fallida desde la PWA offline:** hoy solo operaciones.
- ADR-035 commiteado en `5787d15`. Seed y limpieza: sin commit al cierre.
