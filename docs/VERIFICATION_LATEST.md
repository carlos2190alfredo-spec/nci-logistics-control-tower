# VERIFICATION LATEST

Fecha: 2026-11-16 (Fase 1 de simplificación — ADR-038)

| Verificación | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit`, `eslint .` | Pasan |
| `pnpm test` (Vitest, suite normal) | 1887 tests pasan en 95 archivos, con `TZ=UTC` y con `TZ=America/Panama`; línea base previa: 596. Las pruebas del motor de conductores y de `datetime` también con Tokio, Kiritimati (UTC+14) y Los Ángeles |
| **E2E completa de regresión** | **114 pasan + 3 flaky (`panama-modules` ×3: copias ocultas del streaming de Next, preexistente), 0 fallos (10,6 min)**; incluye CSV, portal, conductor, onboarding, invitaciones (3) y acceso/aislamiento/límites (4). Limpieza `e2e:cleanup` aplicada |
| E2E `catalog-access.spec.ts` (nuevo) | ACCESS-001…004 pasan; 4 mutaciones (ficha de cliente sin filtro de tenant, despachador con permiso de gestión, reactivar sin límite de plan, operaciones con acceso al portal) detectadas; código restaurado |
| **`pnpm test:db` (BD real, local)** | **62 pruebas pasan en 7 archivos (referencias, concurrencia, límites de plan, importación CSV, consultas, esquema, invitaciones, día local)**; repetible, sin residuos (0 tenants `zz-*`, 0 usuarios `@zz-db.local`/`@e2e.local`, 0 invitaciones de prueba) |
| E2E `invitations.spec.ts` (nuevo) | 3 de 3 pasan (INV-001 cuenta nueva y enlace no reutilizable, INV-002 cuenta existente con su sesión vía `/login?next=`, INV-003 enlace inventado) |
| Mutaciones sobre la aceptación de invitaciones | 7 de 7 detectadas por `test:db`; archivos restaurados |
| `pnpm security:check` | Pasa, y ahora de verdad: `grepMissing` corría con un error de shell y varias comprobaciones pasaban en vacío. Con un `fetch(` plantado en `disabled/gps.ts` falla (revertido) |
| `pnpm build` (con `/invitacion/[token]`) | Pasa |
| Mutaciones sobre código de producción | 7 de 7 detectadas por `test:db` (sin bloqueo del plan, `FOR UPDATE`, referencia sin +1, bloqueo sin efecto, importación sin límite, importación sin `tenantId`, conteo con inactivos); archivos restaurados (`git diff` solo `package.json`) |
| E2E `csv-import.spec.ts` tras el arreglo de `import-apply.ts` | 2 de 2 pasan (`.env.local` exportado: `global-setup` no lo carga solo). La E2E completa NO se repitió tras este cambio |
| `pnpm security:check` | Pasa |
| `pnpm build` | Pasa (rutas nuevas: customers, fleet, locations, services, trips/new) |
| `prisma migrate deploy` + `migrate diff` (BD local) | Migración aplicada, sin deriva |
| **E2E completa (local, ClamAV activo)** | **106 pasan + 4 flaky (pasan al reintentar), 0 fallos (8,5 min)**, con las specs nuevas ONB-001, CSV-001/002, PORTAL-001/002/003 y DRV-001. Flaky: ONB-001 (selector ya acotado a `<main>`), `panama-modules` ×2 y FEEDBACK-E2E-001: copias ocultas del streaming (preexistente) |
| ONB-001 (nuevo) | Tenant descartable → cliente, vehículo, equipo, lugar → Nuevo viaje → asignación sin equipo → servicio con equipo → desaparece "Primeros pasos"; `scheduledAt` = 19:00 UTC para 14:00 de Panamá verificado en la BD |
| Revisión visual (Playwright, 1440 y 375 px) | Páginas nuevas sin desborde horizontal tras corregir `min-w-0` y el contenedor de tablas |
| Revisión adversarial del diseño | 5 lentes, 56 verificaciones independientes, 67 hallazgos no refutados (ver ADR-038) |

### Despliegue a staging (2026-11-16, autorizado por el dueño)

| Verificación | Resultado |
| --- | --- |
| Uso frente a plan (SQL de solo lectura en Supabase) | `panatruck-demo` (PROFESSIONAL): 3/30 clientes, 5/50 vehículos; `translogistica-demo` (STARTER): 2/6 y 5/10. Ningún tenant por encima de su tope |
| Backup cifrado (`pnpm backup:postgres`) + `pnpm backup:verify` | 239,7 KB, checksum verificado |
| Restauración real del backup (`pnpm backup:restore:postgres`, base local descartable) | 70 tablas; `tenants` 2, `users` 8, `trips` 15, `audit_logs` 6; la base de prueba se eliminó |
| `pnpm db:deploy --status` → `pnpm db:deploy` → `--status` | Solo `20261115181215_…` pendiente; aplicada; «Database schema is up to date!» |
| Columnas nuevas en Supabase (solo lectura) | `locations.active` NOT NULL default true; `latitude` y `trip_assignments.equipment_id` anulables; `service_requests.source` default `'PORTAL'` (15 filas existentes = PORTAL); `service_types.requires_equipment` default true (6 filas = true) |
| Endurecimiento (en lugar de re-ejecutar `harden.sql`, que requiere el rol `postgres`) | RLS en 70/70 tablas; 0 privilegios de `anon`/`authenticated` sobre tablas; 0 funciones ejecutables por ellos. El `USAGE` del esquema `public` viene del grant por defecto a `PUBLIC`, no de esos roles |
| Escaneo del parche publicado (8 commits) | 0 coincidencias exactas con los 11 valores de `.env.staging.local`; los únicos patrones genéricos son URLs de prueba locales (`user:secret@localhost`) |
| Preview de Vercel `dpl_Ep5Gav41…` (commit `9204482`) | Build `READY`; `/api/internal/health` 200 `HEALTHY`; `/invitacion/<token inventado>` 200 con «Enlace no válido» (la ruta nueva consulta la base migrada); sin entradas en los logs de ejecución |
| Health de Production (código anterior, base ya migrada) | 503 a las 19:59 UTC solo por `clamav` (el gateway de Fly dio 503 en `/livez` tres veces seguidas y luego 200); 200 `HEALTHY` a las 20:00. Postgres, Prisma y storage no fallaron. Causa de la caída de ClamAV no investigada |

### Fusión a `main` (2026-11-16, PR #1)

| Verificación | Resultado |
| --- | --- |
| CI de GitHub en el HEAD `61b87f0` | **Pasan:** Lint / Typecheck / Test / Build (1 m 54 s; migraciones desde cero en Linux limpio, lint, typecheck, tests, `security:check`, build), Dependency audit (tras definir `DATABASE_URL` en el job) y los dos checks de Vercel. **Falla:** Playwright E2E (29 s) en «Initialize containers»: `pull access denied for minio/minio`; no ejecutó ninguna prueba. Misma causa y mismo resultado que las 12 ejecuciones previas de `main` (desde 2026-11-13) |
| Fusión | Merge commit `f8d5b3d` en `main`, con la E2E de GitHub en rojo por esa causa previa y con aprobación del dueño |
| Deployment de Production `dpl_3SwnnsudJwSe4HpfFRnqjn3dwHj8` (commit `f8d5b3d`) | Build `success`. `/api/internal/health`: 503 a las 21:03:03 UTC solo por `clamav` (la primera respuesta de `/livez` del gateway de Fly tardó 24 s; después 200 en 0,4 s) y 200 `HEALTHY` a las 21:03:40. `/invitacion/<token inventado>` 200 con «Enlace no válido»; `/login` sin credenciales demo; `robots.txt` 200. Sin errores en los logs de ejecución (solo el aviso `health.degraded`) |

## No ejecutado
- Flujos con sesión en staging (Primeros pasos, importación CSV, Nuevo viaje, invitación con correo real de Resend): no se tecleó ninguna credencial; hay que recorrerlos a mano.
- `harden.sql` no se re-ejecutó (se verificó su resultado en solo lectura, ver arriba).
- Ninguna E2E de Playwright corrió en GitHub (ver arriba): la única E2E completa sigue siendo la local.
- La E2E completa no se repitió tras la corrección de hora (BIZ-08); `test:db` contra staging sigue bloqueado a propósito.

---


Fecha: 2026-11-13 (Auditoría de producción y endurecimiento — ADR-037)

## Auditoría y correcciones

| Verificación | Resultado |
| --- | --- |
| Auditoría de solo lectura (6 lentes, 98 agentes) | 46 hallazgos: 40 confirmados por 2 verificadores, 2 en disputa, 4 descartados. Ninguno crítico |
| Correcciones (5 grupos de archivos disjuntos) + 2 revisores por grupo | 28 observaciones de revisión; corregidas todas las bloqueantes y mayores y la mayoría de las menores |
| `pnpm typecheck`, `pnpm lint` | Pasan |
| `pnpm test` | 59 archivos, 596 tests pasan |
| `pnpm security:check` | Pasa |
| `pnpm build` | Pasa |
| **E2E completa (local, ClamAV activo)** | **102 pasan + 1 intermitente (pasa al reintentar), 0 fallos, 0 omitidos (8,3 min)**. Intermitente: Panamá — cumplimiento (carga de `/t/…/compliance`) |
| Respaldo cifrado de Supabase staging (`pnpm backup:postgres` con `BACKUP_DATABASE_URL`) | 235,2 KB; checksum verificado (`backup:verify`) |
| **Simulacro de restauración** (`backup:restore:postgres` en un Postgres local descartable) | **70 tablas restauradas**; users 8, tenants 2, trips 15, service_requests 15, audit_logs 2; base descartable eliminada |

## Despliegue con credenciales (2026-11-13, tras reconectar los conectores)

| Verificación | Resultado |
| --- | --- |
| SMTP Resend (`nodemailer.verify`, sin enviar correo) | Credenciales y TLS OK en `smtp.resend.com:465` |
| Cron `/api/internal/cron/maintenance` | Sin token 401; token incorrecto 401; token correcto 200: rescan 0, prune 0, health evaluado y alerta registrada |
| `robots.txt` y `sitemap.xml` con `APP_ENV=production` | `Allow: /` y `/login`, áreas privadas bloqueadas; sitemap con las dos URLs; sin `noindex` |
| Health público | Tras cargar la clave S3: **200 HEALTHY** (Postgres, Prisma, storage y gateway de ClamAV) |

## No ejecutado

- Pruebas contra el sitio desplegado con sesión (no se introducen credenciales en una URL no local).
- Envío real de correo desde la app y subida real de evidencia en el sitio desplegado: necesitan una sesión, y no se escriben credenciales en una URL que no es un entorno de pruebas.

---


Fecha: 2026-11-13 (Staging en la nube — ADR-036 — y rediseño "Manifiesto del istmo")

## Staging en la nube y rediseño

| Verificación | Resultado |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | Pasan |
| `pnpm test` (Vitest) | 35 archivos, 325 tests pasan (nuevos: `antivirus-http.test.ts`, `manifest.test.ts`) |
| Gateway ClamAV (`infra/clamav-gateway`) en Docker local | 401 sin token; `CLEAN` con archivo limpio; `INFECTED` con EICAR; 413 con 7 MB; primer arranque de unos 5 min |
| Supabase `nci-lct-staging` | 22 migraciones aplicadas con el rol `nci_app`; `harden.sql` ejecutado: RLS en 70/70 tablas, 0 permisos para `anon`/`authenticated` |
| Ataque por la Data API con la clave publicable | `GET /rest/v1/users`, `sessions`, `tenants` y `POST tenants` → 401 `permission denied` |
| Advisors de seguridad de Supabase | Solo `rls_enabled_no_policy` (INFO), que es el diseño: se niega todo a la Data API |
| Seed de staging (`APP_ENV=staging`) | 2 tenants, 8 usuarios, 15 viajes, 3 MFA; contraseña y TOTP propios (no los del repo) |
| Revisión visual en navegador (landing, login, portal) | Escritorio 1440×900 y móvil 375 px sin desborde horizontal. Corregidos: sellos del SVG en el origen (la animación CSS pisaba el `transform`), solape de etiquetas y la regla global `a {color: inherit}` sin capa que anulaba `text-*` en enlaces |
| **E2E completa** | **101 pasan + 2 flaky (pasan al reintentar), 0 fallos, 0 omitidos** (17,4 min). Flaky: TENANT-ADMIN-E2E-001 (copia oculta durante el streaming, selector estricto) y EXC-004 (timeout de carga) |

## Hallazgos

- `prisma.config.ts` y 7 scripts cargaban `.env.local` con `override: true`: un
  `DATABASE_URL` exportado apuntaba en silencio a la DB local. Corregido (las variables
  exportadas tienen precedencia); `e2e:cleanup` se niega a correr fuera de la DB local.
- Preexistente, no corregido: error de hidratación de `OfflineQueueBadge` en las páginas
  con shell (estado de la cola offline solo en el cliente).
- Las corridas E2E paralelas (dos suites a la vez) o con navegadores colgados producen
  fallos falsos: correr una sola suite por vez.

## No ejecutado

- Despliegue en Vercel y gateway en Fly.io: pendientes del login de Fly y de las
  credenciales de terceros (S3 de Supabase, Resend) que carga el dueño.

---

## Sesión anterior: seed renovable y limpieza de datos E2E (2026-11-12)

## Seed y limpieza de datos locales

| Comando / Verificación | Resultado |
| --- | --- |
| `pnpm e2e:cleanup` (dry-run) | Panatruck: 295 viajes E2E (217 `OFFLINE-E2E-*`, 78 convertidos desde el portal), 78 solicitudes, 101 documentos, 41 adjuntos, 55 incidentes, 664 recibos offline. Se conservan los 10 viajes del seed. TransLogistica: nada que limpiar |
| Respaldo previo | `pg_dump -Fc` de la DB local (1,3 MB) en el scratchpad de la sesión, fuera del repo |
| `pnpm e2e:cleanup --apply` | Aplicado en una transacción. 142 objetos de MinIO borrados. Un segundo dry-run reporta 0 pendientes |
| `pnpm db:seed` (re-ejecución) | Pasa. La póliza VH-1 vence ahora el 2027-01-31; VH-2 sigue vencida a propósito (2026-11-09) |
| `pnpm typecheck`, `pnpm lint` (archivos tocados), `pnpm test` | Pasan: 317 tests |
| ClamAV local | El contenedor `nci-lct-clamav` estaba detenido desde hace 3 meses. Se levantó con `docker compose up -d clamav` (healthy en 40 s) |
| E2E completa, 1.ª corrida (ClamAV detenido) | 86 pasan, 2 fallan, 1 flaky, 12 sin correr, 8,4 min. El dev server ya no se cae en `/trips`. Fallos: FILE-SEC-001 (ClamAV detenido) y E2E-FLOW-001, que recorre el flujo hasta el cierre y solo falla porque la evidencia queda en cuarentena sin antivirus |
| `file-security` + `service-workflow` + `offline-sync` con ClamAV | E2E-FLOW-001 pasa. `file-security` pasa 10/10 en dos corridas aisladas consecutivas |
| E2E completa, 2.ª corrida (ClamAV activo) | 87 pasan, 4 fallan, 4 flaky, 6 sin correr, 30 min. Todos los fallos (FILE-SEC-003/006, OFFLINE-E2E-001/007, E2E-FLOW-003, route-driver-recommendation, EXC-005) quedan en la pantalla de `/login`: es la carrera de hidratación de los helpers `login` (los snapshots de Playwright lo muestran). No es seed ni volumen de datos |

## Helper de login compartido y specs autosuficientes

| Comando / Verificación | Resultado |
| --- | --- |
| `tests/e2e/helpers/auth.ts` | Un único `login()` para las 11 specs: espera la hidratación real del formulario (props de React en el `<form>`), verifica los valores escritos, exige salir de `/login` y completa el TOTP del seed |
| Specs con dependencia de datos sobrantes | FILE-SEC-004 y FILE-SEC-008 crean su propio documento o adjunto (FILE-SEC-008 pasa un PNG real por el pipeline con ClamAV); PHOTO-SYNC/PHOTO-EXIF crean su viaje en `DELIVERY_IN_PROGRESS`. Todos limpian al terminar |
| Selectores con copia oculta durante el streaming | `getByRole("heading")` en el horario del conductor y `select[name='type']:visible` en feedback. Causa de la copia oculta no confirmada |
| `pnpm exec eslint tests/e2e`, `pnpm typecheck` | Pasan |
| **E2E completa (desde DB limpia, ClamAV activo)** | **103/103 pasan, 0 fallos, 0 flaky, 0 reintentos, 0 omitidos (15,2 min)** |

---

## Sesión anterior del mismo día (ADR-035)

## Resultados ejecutados

| Comando / Verificación | Resultado |
| --- | --- |
| `pnpm typecheck` | Pasa |
| `pnpm lint` | Pasa: 0 errores, 0 warnings |
| `pnpm test` (Vitest) | Pasa: 33 archivos, 317 tests (14 nuevos de máquinas de estado) |
| `pnpm security:check` | Pasa: 77/77 |
| `pnpm build` | Pasa |
| `prisma migrate deploy` + `migrate diff` contra la DB local | Migración aplicada, diff vacío (sin drift) |
| E2E `trip-exceptions.spec.ts` (EXC-001…006) | 6/6 pasan. Se ejecutaron en tandas, sin reintentos; no en una sola corrida |
| E2E `offline-sync.spec.ts` | 9/9 pasan, sin reintentos (corrida aislada) |
| E2E `service-workflow.spec.ts` E2E-FLOW-001 | Ver "Hallazgos de entorno" |
| E2E `panama-modules.spec.ts` (sin el test de selects de mantenimiento) | Pasan en corrida aislada |
| E2E `route-driver-recommendation.spec.ts` | 1 fallo + 1 flaky. Ver "Hallazgos de entorno" |

## Hallazgos de entorno (no son regresiones de ADR-035)

1. **La póliza de VH-1 del seed venció por calendario.** El seed usa `day(80)` desde
   julio, así que vence el 2026-10-05. La guarda de cumplimiento, cuya lógica no cambió,
   bloquea VH-1 y E2E-FLOW-001 no puede asignar. Antes el bloqueo era silencioso; ahora la
   UI lo explica.
   - Verificación: con una excepción de cumplimiento temporal para `VEHICULO:VH-1`, creada
     y borrada en la misma sesión, el flujo llegó a `EVIDENCE_SUBMITTED`. Recorrió
     asignación, los 10 avances del conductor y el registro de evidencia.
   - La aprobación del POD y el cierre se completaron con un spec temporal (ya borrado):
     `EVIDENCE_APPROVED` → POD generado → `CLOSED`, `proofReady=true`.
   - El test original agotó su timeout de 240 s cargando `/trips`.
2. **La DB local acumula 246 viajes activos de corridas previas.** `/t/panatruck-demo/trips`
   en `next dev` tarda minutos y llega a tumbar el dev server. Desde ese punto, todas las
   suites posteriores fallan con `ERR_CONNECTION_REFUSED`.
   - A/B: el test "los selects de asignación deshabilitan el vehículo en mantenimiento"
     **también falla sobre el código base sin cambios** (`git stash`: timeout de 60 s en
     `page.goto('/trips')`).
3. **`route-driver-recommendation.spec.ts`:**
   - el snapshot del fallo queda en `/login` con los valores por defecto del formulario
     (carrera de hidratación del helper `login`);
   - `getByText('Horario Semanal')` encuentra 2 elementos en la página de horarios.

   Ninguna de esas páginas se tocó en esta sesión.
4. `tests/e2e/global-setup.ts` no carga `.env.local`: hay que exportar las variables antes
   de `playwright test`.

## No ejecutado

- Suite E2E completa en una sola corrida verde (bloqueada por el punto 2).
- Prueba de concurrencia directa del `updateMany` de transiciones. El envío obsoleto se
  probó vía UI (EXC-003) y la carrera real de asignación con EXC-005.

## Conteos

| Tipo | Cantidad |
| --- | --- |
| Unit tests (Vitest) | 317 |
| E2E specs | 13 (nuevo: `trip-exceptions.spec.ts`) |
| Security checks | 77 |
| Prisma migrations | 23 |
| ADRs | 35 |
