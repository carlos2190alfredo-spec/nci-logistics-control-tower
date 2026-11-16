# HANDOFF LATEST

## 2026-11-16 — Fase 1 de simplificación (ADR-038): implementada y desplegada a staging (falta fusionar a `main`)

- **Despliegue autorizado por el dueño el 2026-11-16 ("Sí, desplegar") y ejecutado hasta el Preview:** (1) uso frente a plan revisado en Supabase (2 tenants demo, todos por debajo de sus topes); (2) backup cifrado `backups/2026-11-16_19-55-22` (239,7 KB, `backup:verify` OK) y restauración real en una base local descartable (70 tablas, 2 tenants, 15 viajes); (3) `pnpm db:deploy` aplicó `20261115181215_phase1_catalogs_and_optional_equipment` y `--status` quedó sin pendientes; (4) `harden.sql` NO se re-ejecutó (necesita el rol `postgres`; la migración no creó tablas) y se comprobó en solo lectura: RLS en 70/70 tablas, 0 privilegios de `anon`/`authenticated`; (5) push de la rama `feat/fase1-catalogos-nuevo-viaje` → Preview de Vercel `dpl_Ep5Gav41…` en READY, con health `HEALTHY` y `/invitacion/<token inventado>` mostrando «Enlace no válido».
- **Falta:** fusionar a `main` (Production). `main` sigue en `9a080a5`. Rollback del código: Instant Rollback al deployment `dpl_Hh9QbnhYa3fponMBT9bj8sKbiUFK`; la base no se restaura (migración aditiva).
- **No verificado en la nube:** ningún flujo con sesión (Primeros pasos, importación CSV, Nuevo viaje, invitación con correo real de Resend). Hay que recorrerlos a mano con una cuenta de staging; no se teclearon credenciales.
- **Observación (no relacionada con la Fase 1):** hacia las 19:59 UTC el health de Production dio 503 por `clamav` (el gateway de Fly respondía 503 en `/livez`) y volvió a HEALTHY solo en ~1 minuto. Causa no investigada (sin acceso al panel de Fly); conviene revisar los reinicios de la máquina y poner un monitor externo.
- Leer `docs/decisions/ADR-038-phase1-self-service-catalogs.md` (decisiones, implementado, pendiente y hallazgos de la revisión). La rama tiene 8 commits sobre `origin/main`.
- Hecho: catálogos (clientes, flota, lugares, tipos de servicio), Nuevo viaje, equipo opcional, Primeros pasos, menú "Mi negocio", importación CSV, acceso de clientes al portal y vínculo conductor↔cuenta. Verificado con tsc, eslint, 1822 tests, security:check, build y E2E completa (106 + 4 flaky por copias ocultas del streaming, 0 fallos).
- Código en la rama `feat/fase1-catalogos-nuevo-viaje` (publicada en `origin`).
- **Pruebas con BD real (hecho):** `pnpm test:db` (47 pruebas, `tests/db/`, solo contra la BD local: la guarda bloquea cualquier otro destino). Encontró y se corrigió un error de la importación de clientes (pérdida silenciosa de una fila con código explícito repetido). Detalle en ADR-038.
- **Invitaciones al equipo (hecho):** `/invitacion/[token]` ya existe (antes el correo llevaba a una página inexistente). Cuenta nueva con contraseña propia o cuenta existente solo con su sesión; enlace de un solo uso atómico; `/login?next=` estricto. Detalle y pruebas (60 con BD real, 3 E2E) en ADR-038.
- **Comprobación de seguridad arreglada:** `security-check.ts::grepMissing` fallaba en silencio (sintaxis de shell) y varias comprobaciones pasaban en vacío; ahora corre sin shell y falla si grep falla.
- **E2E de roles, aislamiento y límites (hecho):** `catalog-access.spec.ts` (ACCESS-001…004) con 4 mutaciones detectadas. E2E completa de regresión: 114 pasan + 3 flaky (`panama-modules`, copias ocultas del streaming) y 0 fallos.
- **Hora de la empresa (hecho, BIZ-08):** el motor de conductores, el contexto de IA, operations-insights y el cupo del copiloto leían día/hora de la zona del servidor (UTC en Vercel); ahora usan Panamá con helpers de `datetime.ts`. Detalle en ADR-038.
- Pendiente prioritario: fusionar a `main` (Production), recorrer a mano los flujos con sesión y confirmar con el dueño las cifras de plan (`tenant_plans`, sin validación comercial; ahora bloquean altas).
- Si Mailpit local no responde el saludo SMTP (`ETIMEDOUT`/"Greeting never received"): `docker restart nci-lct-mailpit`.
- Orden de despliegue (cumplido en esta fase): backup + `pnpm db:deploy` en staging + comprobar `harden.sql`; recién después push. Las E2E nuevas crean un tenant `zz-e2e-*` descartable y lo borran al final.

## 2026-11-13 (noche) — Endurecimiento de producción (ADR-037)

- Leer `docs/decisions/ADR-037-production-readiness-audit.md` y `docs/STAGING_DEPLOYMENT.md`.
- **Hecho con los conectores (2026-11-13):** `MAIL_PASSWORD` (API key de Resend solo de envío
  para `nciautomation.com`), `CRON_SECRET` y `APP_ENV=production` en Vercel Production
  (Preview sigue en `staging`). Los valores viven en `.env.staging.local` (local, ignorado).
- **Clave S3 hecha:** creada en Supabase con el Chrome del dueño (extensión de Claude); el ID lo cargó
  el conector de Vercel y el secreto lo pegó el dueño. Health 200 HEALTHY.
- **Pendiente:** probar con sesión una subida de evidencia (debe quedar `AVAILABLE`, documento
  `INTERNAL` hasta aprobar) y un correo real (recuperar contraseña con un correo propio). Opcional:
  `OPS_ALERT_EMAIL`.
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
