# ADR-038 — Autoservicio de catálogos, viajes creados por operaciones y equipo opcional (Fase 1)

Fecha: 2026-11-16 · Estado: **implementado** (catálogos, Nuevo viaje, equipo opcional, Primeros pasos, importación CSV, acceso al portal y vínculo de conductores); pendientes abajo · Contexto: análisis de producto del 2026-11-15 ("simplificar para que el tenant llegue solo a su primer viaje").

## Problema (verificado en el código)
Un tenant real no puede cargar clientes, flota, lugares ni tipos de servicio (solo el seed y acciones demo locales los crean); solo `CUSTOMER_ADMIN` crea solicitudes; la asignación exige equipo siempre; los límites de plan nunca se aplican; las referencias usan `count()+1`; los `datetime-local` se interpretan en la zona del servidor (desfase real de 5 h en Vercel/UTC).

## Decisiones
1. Sin tablas nuevas. Migración aditiva `20261115181215_phase1_catalogs_and_optional_equipment` (aplicada solo a la BD local): `customer_accounts` (+tax_id, contact_*, address, internal_notes), `locations` (+active, lat/lng opcionales), `service_types.requires_equipment`, `service_requests.source`, `trip_assignments.equipment_id` nullable.
2. Inactivar, no borrar. Vehículo/Equipo: `status="INACTIVE"`; cliente/lugar/tipo: `active=false`. `code` y `plate` inmutables salvo reglas de renombrado seguras (cumplimiento y mantenimiento enlazan por texto).
3. Desactivar un cliente desactiva sus membresías; reactivar no las reactiva.
4. "Nuevo viaje" = `ServiceRequest` CONVERTED + `Trip` CONFIRMED en una sola transacción (`createTripFromRequest`), ruta `/t/[slug]/trips/new`; la asignación sigue en la tarjeta de `/trips`.
5. Referencias por MAX del sufijo bajo `FOR NO KEY UPDATE` del tenant; hora de pared de Panamá con `parseTenantLocal`.
6. Permisos nuevos: `tenant.catalogs.view|manage`, `tenant.customers.portal` (OWNER/ADMIN), `tenant.trips.create` (= `REQUEST_OPERATIONS_ROLES`).
7. Límites de plan aplicados a vehículos y clientes (solo activos). Las cifras de `tenant_plans` no tienen validación comercial: el dueño debe confirmarlas antes del primer tenant real.
8. Sin dependencias nuevas ni integraciones reales nuevas.

## Implementado y verificado (2026-11-16)
- **Cimientos:** `datetime` (hora de Panamá), referencias por MAX bajo bloqueo, `createTripFromRequest`, límites de plan (vehículos y clientes), validación/normalización de catálogos, parser CSV (UTF-8/Windows-1252, `,` y `;`), kit de UI (`ServerForm`, campos con error, `UsageBar`, `ConfirmSubmit`, `PageNotice`, …).
- **Pantallas y acciones:** Clientes (lista, ficha, alta/edición, desactivar en cascada), Flota (vehículos y equipos, inactivar con bloqueo si hay viajes activos, placa editable solo sin documentos de cumplimiento vinculados), Lugares y Tipos de servicio (con plantillas; todo tenant nuevo nace con los 5 tipos sugeridos), **Nuevo viaje** (`/trips/new`: pedido CONVERTED + viaje CONFIRMED en una transacción, idempotente), lista **Primeros pasos** en el Resumen y grupo "Mi negocio" en el menú.
- **Asignación:** equipo opcional según `requiresEquipment` (sin `undefined` en `where`/`OR`), `scheduledAt` ya no se reenvía (se conserva la hora del viaje) y se interpreta en hora de Panamá; tarjeta con resumen de carga y resaltado del viaje recién creado.
- **Correcciones a lo existente:** un `DRIVER` sin ficha ya no ve todos los viajes; el portal oculta el formulario de solicitud a quien solo consulta y no deja que las solicitudes de operaciones desplacen las que el cliente debe atender; `TableRow` admite atributos (`data-testid`); las tablas no desbordan la página en móvil.
- **Verificación:** `tsc` limpio, `eslint` limpio, Vitest 1806/1806, `security:check` pasa, `pnpm build` pasa. E2E completa (local, ClamAV activo): 101 pasan + 3 flaky que pasan al reintentar (ONB-001 por una copia oculta del streaming ya corregida en la spec, y dos preexistentes: `route-driver-recommendation` y E2E-FLOW-001 por la misma causa), 0 fallos (10 min). Nueva `tests/e2e/onboarding-journey.spec.ts` (ONB-001) con tenant descartable (`helpers/tenant-factory.ts`): recorre tenant nuevo → cliente, vehículo, equipo, lugar → Nuevo viaje → asignación sin equipo (verifica `scheduledAt` = 19:00 UTC para 14:00 de Panamá) → servicio con equipo → desaparece la lista. Revisión visual a 1440 y 375 px sin desborde.

## Añadido después (2026-11-16)
- **Importación CSV** (clientes, vehículos, equipos, lugares): panel con vista previa en el navegador (UTF-8/Windows-1252, `,` y `;`, rechaza `.xlsx` con explicación) y acción con revalidación en el servidor, omisión de lo existente, límites de plan todo-o-nada y tope de 10 importaciones/hora por usuario. E2E CSV-001/002.
- **Acceso de clientes al portal** (solo propietario/administrador): correo de un solo uso (48 h, sin contraseña), reenviar solo si la persona nunca inició sesión, desactivar/reactivar. Una cuenta que ya existe sin membresía en este tenant, de plataforma o inactiva recibe el MISMO rechazo neutro (no se vincula en silencio, no revela qué correos existen) con tope de intentos. E2E PORTAL-001/002/003 con verificación del correo en Mailpit.
- **Conductores:** el alta ya no termina en la pantalla de error (aviso por dato inválido o código repetido), el menú tiene "Conductores", y la ficha permite vincular la cuenta de usuario con rol Conductor. E2E DRV-001 (un conductor sin ficha no ve viajes ajenos).
- **Verificación final:** tsc/eslint limpios, 1822 tests, `security:check`, `pnpm build`, E2E completa 106 pasan + 4 flaky (copias ocultas del streaming; sin fallos).

## Pruebas con base de datos real (2026-11-16)
`pnpm test:db` (configuración aparte: `vitest.db.config.ts`; la suite normal `pnpm test` nunca toca una base). 47 pruebas en `tests/db/*.db.test.ts`, secuenciales, contra PostgreSQL 17 local.
- **Guarda de destino** (`scripts/lib/db-test-guard.ts`, 17 pruebas en la suite normal): solo `APP_ENV=local`, host local, sin pooler y sin nombres de base `prod`/`staging`/`live`. Falla cerrado y lanza en lugar de omitir. Los helpers leen solo `.env.local` y `.env`, nunca `.env.staging.local`.
- **Aislamiento:** cada archivo crea tenants descartables `zz-db-*` (`isDemo=false`, para que `e2e:cleanup` no los toque) y usuarios `@zz-db.local`, los borra al terminar y barre los que dejó una corrida interrumpida. Los planes sembrados no se modifican (se usa DEMO: 5 vehículos, 3 clientes).
- **Qué demuestran que un mock no puede:**
  - `nextReference`: el SQL toma el MÁXIMO e ignora otras series, otra capitalización, sufijos no numéricos y de 10 o más dígitos (no desbordan el `int`); un sufijo de 9 dígitos agota la numeración con un error claro.
  - Concurrencia: 12 altas simultáneas obtienen 0001…0012 sin repetir; 8 "Nuevo viaje" simultáneos, solicitudes y viajes consecutivos. Sin el bloqueo, dos creaciones calculan el mismo número y la restricción única lo atrapa.
  - Bloqueo `FOR NO KEY UPDATE`: quien lo tiene NO frena inserciones hijas (vehículos, solicitudes) pero sí a otro creador. Cambiarlo por `FOR UPDATE` hace fallar la prueba.
  - Forma real del `P2002` con Prisma 6.19 y el motor por defecto: `meta.target` lista columnas; `isUniqueViolation(error, "plate" | "code" | "reference" | "tenantId" | "clientRequestKey" | "serviceRequestId" | "name")` distingue la restricción que falló.
  - Límites de plan: borde exacto, lote que no cabe, inactivos que liberan cupo, otra empresa que no cuenta, tenant ya excedido, cambio de plan visto por la siguiente alta, y carreras (1 cupo y 6 altas → entra 1; 2 cupos y 7 altas → entran 2).
  - Importación CSV completa (`parseCsv` → `validateImport` → `applyCatalogImport`): idempotente, omisión sin tildes/mayúsculas, identidad compartida placa↔unidad, todo o nada ante el plan y los topes fijos, 900 filas en lotes, dos importaciones simultáneas sin duplicar, y otra empresa con los mismos datos intacta.
  - Consultas de lectura (`getStartupCounts`, `listCustomers`, `listVehicles`, `listEquipment`, `countFleet`): filtro por tenant con `OR` de búsqueda, estados, accesos de portal activos y paginación. Migración `20261115181215`: columnas, valores por defecto, nulabilidad de `trip_assignments.equipment_id` y `onDelete: Restrict` del equipo.
- **Las pruebas se probaron a sí mismas** rompiendo a propósito el código de producción: 7 mutaciones (sin bloqueo en `assertWithinPlanLimit`, `FOR UPDATE`, referencia sin +1, bloqueo sin efecto, importación sin límite de plan, importación sin `tenantId` en lo existente, conteo de clientes con inactivos), las 7 detectadas. La primera versión de la mutación del `FOR UPDATE` cayó en un comentario y no probaba nada; se rehízo con el SQL exacto.
- **Error real encontrado y corregido** (`import-apply.ts`): un CSV con una fila sin código y otra con el código explícito que el generador habría asignado a la primera (p. ej. `CLI-0001`) informaba "3 creados" pero guardaba 2: `skipDuplicates` descartaba una fila sin avisar. Ahora el generador salta los códigos explícitos del archivo y, si la base guarda menos filas de las esperadas, se lanza `RangeError` y la transacción se revierte ("No se importó nada"), en lugar de informar filas que no existen. Pruebas: 1 con BD real y 2 unitarias.

## Invitaciones al equipo (2026-11-16)
El correo de invitación (`createInvitation`, ya existente) enviaba `/invitacion/<token>`, una página que NO existía: el administrador veía "Invitación enviada" y la persona recibía un enlace muerto. Ahora funciona.
- **Ruta pública** `/invitacion/[token]` (noindex; en `PRIVATE_PATH_PREFIXES`) y `acceptInvitationAction`. Lógica en `invitation-accept.ts` y reglas puras en `invitation-rules.ts`, sin "use server".
- **Un solo uso, atómico:** el token solo existe en claro en el enlace (en la base, SHA-256). Se reclama con un `updateMany` condicional (`usedAt` nulo y no vencida) en la MISMA transacción que crea la cuenta y la membresía; con 5 aceptaciones simultáneas gana exactamente una.
- **Cuenta nueva:** la persona elige nombre y contraseña (misma política que el restablecimiento: 10 a 128 caracteres; una prueba estática mantiene ambas iguales); el correo queda verificado porque el enlace llegó a él. Correo, rol y empresa salen de la invitación, nunca del formulario.
- **Cuenta existente:** tener el enlace NO basta para unirla a una empresa. Debe haber iniciado sesión con esa misma cuenta (sesión completa, no MFA pendiente); con otra sesión o sin sesión se explica el siguiente paso; una cuenta inactiva no acepta.
- **Sin escalada de rol:** el propietario nunca es invitable (también se rechaza si la fila lo trajera por manipulación de datos); quien ya tiene cualquier membresía en la empresa, activa o no, no recibe un segundo rol (el enlace queda consumido); una empresa no activa deja de aceptar gente.
- **`/login?next=`:** el enlace "Iniciar sesión" de la página vuelve a la invitación tras el acceso. `safeNextPath` solo admite la ruta exacta `/invitacion/<token>` (sin redirección abierta). Antes, una cuenta sin membresías volvía a `/login` sin explicación.
- **UX:** `ServerForm` en vez de `<form action>`: un error (contraseñas distintas) ya no vacía lo escrito (React 19 reinicia los formularios con `action`). El mismo defecto sigue en `reset-password-form.tsx` (preexistente, sin tocar).
- **Verificación:** 35 pruebas unitarias nuevas (reglas de invitación y `next-path`), 13 con BD real (`tests/db/invitations.db.test.ts`) y 3 E2E (`invitations.spec.ts`: INV-001 cuenta nueva, INV-002 cuenta existente con sesión, INV-003 enlace inventado). Mutaciones: 7 de 7 detectadas (reclamo sin condición, cuenta ajena, sin sesión, segundo rol, propietario, empresa suspendida, correo sin verificar). Revisión visual a escritorio y 375 px sin desborde.
- **Fuera de alcance, pendiente:** no hay botón para revocar una invitación pendiente en la pantalla (`revokeInvitation` existe pero no está enlazado) y no se reenvía una invitación vencida sin crear otra.

## Comprobación de seguridad que pasaba en vacío (2026-11-16)
`scripts/security-check.ts::grepMissing` armaba el `grep` con `execSync` y los argumentos unidos por espacios: patrones como `fetch(` o `got(` rompían la sintaxis del shell, `grep` salía con código 2 y se interpretaba como "sin coincidencias". Las comprobaciones que dependen de ella ("los proveedores desactivados no hacen llamadas HTTP", sin `queryRawUnsafe`, sin `dangerouslySetInnerHTML`, claves `sk-`/`Bearer`, `reasoning_content`) pasaban sin haber mirado nada. Ahora usa `execFileSync` (sin shell) y cualquier fallo distinto de "sin coincidencias" hace FALLAR la comprobación. Comprobado: sin cambios todas pasan; con un `fetch(` plantado en `disabled/gps.ts` la comprobación falla (revertido).

## E2E de roles, aislamiento y límites de plan (2026-11-16)
`tests/e2e/catalog-access.spec.ts` (4 pruebas, dos tenants descartables: A con plan DEMO y B con datos propios; `createThrowawayMember` crea miembros con un rol concreto):
- **ACCESS-001:** el despachador y seguridad consultan clientes y flota pero no ven formularios de alta; el despachador SÍ abre "Nuevo viaje" y seguridad no; ninguno ve el acceso al portal ni "Desactivar cliente". El conductor es devuelto a su app desde clientes, flota, lugares, servicios y Nuevo viaje.
- **ACCESS-002:** operaciones gestiona catálogos pero no el acceso al portal; el propietario sí.
- **ACCESS-003 (aislamiento):** las pantallas de otra empresa no se abren y nada de ella aparece; un id de B dentro de la ruta de A (cliente, vehículo, lugar, tipo de servicio) muestra "Página no encontrada" y no confirma que exista; la búsqueda de A no encuentra datos de B. Nota: con streaming Next responde 200 y pinta el 404, por eso se comprueba el contenido y no el código HTTP.
- **ACCESS-004 (plan):** con plan DEMO (3 clientes) el cuarto se rechaza explicando "permite hasta 3 clientes y ya tiene 3", sin perder lo escrito; desactivar uno libera cupo; y reactivar el primero ya no cabe (sigue inactivo y el aviso lo explica).
- **Mutaciones:** 4 de 4 detectadas (ficha de cliente sin filtro de tenant, despachador con permiso de gestión, reactivar sin límite de plan, operaciones con acceso al portal).

## Día y hora de la empresa, no del servidor (2026-11-16)
El motor de recomendación de conductores usaba `getDay()`, `getHours()` y `setHours(0, 0, 0, 0)`, que leen la zona del PROCESO. En Vercel (UTC) un viaje de las 19:30 del lunes en Panamá (00:30Z del martes) se evaluaba como "martes 00:30": el horario del lunes no se encontraba, las vacaciones de ese lunes no descalificaban al conductor y la ventana "del día" empezaba a las 19:00 del día anterior. En el equipo de desarrollo (Panamá) nada de esto se veía.
- **Funciones nuevas** en `datetime.ts` (puras, con zona explícita, por defecto Panamá): `tenantLocalDate`, `tenantLocalTime`, `tenantLocalWeekday`, `tenantDayBounds` (`{ gte: start, lt: end }`, el día del cambio de horario dura 23 o 25 h) y `tenantCalendarDate` (medianoche UTC de la fecha local, para columnas `@db.Date`).
- **Corregido:** el motor (`RecommendationInput.timeZone`, por defecto Panamá), `generateDriverRecommendationAction` (excepciones por `@db.Date` y viajes del día por ventana), el contexto de IA (`tenant-context.ts`), `operations-insights` y la clave diaria del cupo del copiloto (`copilot-actions.ts`: ya no se reinicia a las 19:00 de Panamá).
- **Verificación:** 4 de 5 pruebas nuevas del motor fallaban con `TZ=UTC` antes del arreglo. Después, las pruebas del motor y de `datetime` pasan con `TZ` = UTC, Panamá, Tokio, Kiritimati (UTC+14) y Los Ángeles, y la suite completa con UTC y Panamá. Pruebas con BD real de la ventana del día (límites 00:00 y 23:59:59.999) y de la excepción `@db.Date`. Las pruebas antiguas del motor leían `getDay()` de la zona de la máquina: ahora usan un día fijo.
- **Fuera de alcance:** la zona sigue siendo fija (Panamá); el parámetro `tz` existe para cuando sea configurable por empresa.

## Despliegue de la Fase 1 (ejecutado el 2026-11-16 salvo la fusión a `main`)
La rama `feat/fase1-catalogos-nuevo-viaje` (8 commits sobre `origin/main` 9a080a5) se publicó en `origin` y la migración se aplicó a Supabase staging; `main` sigue en 9a080a5. Procedimiento general: `docs/STAGING_DEPLOYMENT.md` ("Migraciones" y "Orden de migraciones y despliegue"). Lo específico de esta fase:
1. **Autorización:** push, migración de Supabase y despliegue requieren que el dueño los apruebe (AGENTS.md; ADR-036). Production y Preview comparten UNA base: incluso un push de la rama (Preview) ejecuta código que lee columnas nuevas, así que la migración va ANTES de cualquier push.
2. **Revisar el uso frente al plan** (ahora los límites bloquean altas de vehículos y clientes ACTIVOS; las cifras de `tenant_plans` no tienen validación comercial). Ejecutar en Supabase (solo lectura) y confirmar con el dueño que ningún tenant real quedaría por encima:
   ```sql
   select t.slug, p.code as plan,
     (select count(*) from customer_accounts c where c.tenant_id = t.id and c.active) as clientes, p.max_customers,
     (select count(*) from vehicles v where v.tenant_id = t.id and v.status <> 'INACTIVE') as vehiculos, p.max_vehicles
   from tenants t join tenant_plans p on p.id = t.plan_id order by t.slug;
   ```
   (Consulta probada en la base local: 3 tenants demo, todos por debajo de sus topes.) Un tenant por encima no pierde datos, pero no podría agregar ni reactivar hasta ampliar el plan.
3. **Backup** reciente y verificado (`pnpm backup:postgres` + `pnpm backup:verify <dir>`).
4. **Migrar:** `pnpm db:deploy --status` (debe listar solo `20261115181215_phase1_catalogs_and_optional_equipment`; la anterior `20261112120000` ya está en staging) y `pnpm db:deploy`, con `CONFIRM_DB_HOST` igual al host. La migración es ADITIVA (columnas nulas o con valor por defecto, un `DROP NOT NULL`): el código antiguo sigue funcionando si hay que revertir el despliegue, sin restaurar la base.
5. **`infra/supabase/harden.sql`** otra vez y `pnpm db:deploy --status` sin pendientes.
6. **Push** de la rama (Preview) y verificación; después fusionar a `main` (Production). Tras desplegar: `docs/STAGING_DEPLOYMENT.md` ("Verificación tras desplegar") y recorrer a mano "Primeros pasos", importar un CSV pequeño, "Nuevo viaje" y una invitación con un correo real (el correo real es lo único que ninguna prueba local cubre; Resend ya está configurado).
7. **Revertir:** redeploy del commit anterior en Vercel; la base no necesita restaurarse (migración aditiva). Los tenants creados después ya tendrían las 5 plantillas de servicio; no estorban al código antiguo.

### Ejecución (2026-11-16, autorizada por el dueño)
Pasos 2 a 5 del runbook y el push de la rama hechos; resultados en `docs/VERIFICATION_LATEST.md`. Diferencia respecto al plan: `harden.sql` no se re-ejecutó porque contiene `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (el rol `nci_app` no puede) y esta migración no crea tablas; se comprobó en solo lectura que las 70 tablas tienen RLS y que `anon`/`authenticated` no tienen privilegios. Falta: fusionar a `main` (Production) y recorrer a mano los flujos con sesión, incluida una invitación con correo real.

## Pendiente (no implementado)
- `e2e:cleanup` ampliado a los tenants `zz-e2e-*` y `zz-db-*` huérfanos (hoy se limpian al terminar cada spec y `sweepStaleTestTenants` barre los de `test:db`).
- Revocar y reenviar invitaciones desde la pantalla (`revokeInvitation` existe pero no está enlazado).
- Reglas de identidad de placa/código más estrictas (SEC-04), y el portal sigue exigiendo datos de contenedor para cualquier tipo de servicio.
- Fusión a `main` (Production) y recorrido manual de los flujos con sesión. Las cifras de plan (`tenant_plans`) no tienen validación comercial y ahora bloquean altas de vehículos/clientes: confirmarlas antes del primer tenant real.

## Revisión adversarial del diseño (5 lentes, 56 verificaciones)
Hallazgos no refutados (el detalle completo vive en el journal del workflow de la sesión):

| id | severidad | veredicto | título |
|---|---|---|---|
| BIZ-01 | blocker | partial | Sin compuerta de entrega: empujar antes de migrar rompe consultas de sesión; faltan rollback y límites de autorización |
| BIZ-02 | major | confirmed | La lista de arranque no lleva al KPI: no pide equipo, marca «primer viaje» al crearlo (no al asignarlo) y /trips/new no avisa de los prerrequisitos de asignación |
| BIZ-03 | major | confirmed | El conductor registrado no puede vincularse a un usuario; un DRIVER sin perfil ve todos los viajes del tenant y el alta de conductor falla con 500 ante un código repetido |
| BIZ-04 | major | partial | Los límites de plan pasan de informativos a bloqueos duros con cifras nunca validadas y sin salida autónoma |
| BIZ-05 | major | confirmed | El portal que Fase 1 abre a los clientes solo sirve para contenedores y las solicitudes de operaciones desplazan las accionables |
| BIZ-06 | major | partial | La importación CSV corrompe tildes y eñes cuando el archivo viene de Excel en Windows (ANSI) porque se lee siempre como UTF-8 |
| BIZ-07 | major | partial | No hay aceptación del KPI (tenant nuevo → viaje asignado), ni corrida E2E con ambas zonas horarias, ni prueba contra Postgres real de numeración y cupo, ni correo real verificado |
| BIZ-08 | major | partial | Corregir la zona horaria de entrada cambia lo que lee el motor de recomendación de conductores en servidores UTC (regresión silenciosa) |
| BIZ-09 | major | partial | Decisiones de producto cerradas sin confirmar con el dueño y sin distinguir cuáles son baratas de revertir y cuáles no |
| BIZ-10 | major | partial | Entregables obligatorios de AGENTS.md sin dueño: ADR-038, documentos de cierre y guías de usuario (una afirma una función inexistente) |
| BIZ-11 | minor | sin verificar | Alcance: recortar coordenadas, el cambio a export/csv.ts (ya implementado), la notificación PORTAL al cliente y la acotación de DST |
| BIZ-12 | minor | sin verificar | Los KPIs se pueden medir con datos existentes (sesiones + AuditLog); falta fijar t0 y la consulta, y «pantallas» solo se mide con E2E |
| BIZ-13 | minor | sin verificar | Costos: sin servicios nuevos, pero el cupo de correo es solo por tenant y compartido con la recuperación de contraseña; el plan de Resend no está verificado |
| BIZ-14 | minor | sin verificar | Superficies existentes que contradicen el camino nuevo: Invitaciones con enlace 404, contraseña obligatoria al crear usuarios, acceso desactivado sin mensaje y alta de tenant con errores crudos |
| UX-01 | major | partial | Chasis o remolque: requisito invisible del primer viaje (4 de 5 tipos sembrados lo exigen) |
| UX-02 | major | partial | El paso 'Registre un conductor' lleva a una zona sin menú y a un formulario que termina en error.tsx |
| UX-03 | major | confirmed | El viaje asignado no llega a ningún conductor real, y un usuario DRIVER sin vínculo ve todos los viajes |
| UX-04 | major | partial | DISPATCHER y ADMIN quedan sin salida; 'Lo registra su administrador' se lo diría al propio administrador |
| UX-05 | major | partial | CSV de Excel: las tildes se corrompen en silencio y un .xlsx produce errores incomprensibles |
| UX-06 | major | confirmed | Tras crear el viaje, el resaltado por :target no funciona en navegación suave y la tarjeta queda bajo la barra superior |
| UX-07 | major | partial | Los vacíos de /trips y del Resumen contradicen 'Nuevo viaje'; el Resumen de un tenant nuevo es ruido en cero |
| UX-08 | major | partial | Se piden y muestran datos que nadie lee: notas, contacto, canal, coordenadas, dirección |
| UX-09 | major | partial | Formularios con <details>: el envío puede bloquearse sin mensaje y los errores quedan ocultos |
| UX-10 | major | confirmed | Los viajes creados por operaciones desplazan las solicitudes accionables del portal del cliente |
| UX-11 | minor | sin verificar | Primeros pasos: unos 20 clics, sin 'siguiente paso', y el bloque reaparece al desactivar |
| UX-12 | minor | sin verificar | Navegación: /trips/new activa dos ítems y el grupo 'Mi negocio' desentona |
| UX-13 | minor | sin verificar | Listas: filtro 'Estado' engañoso, búsqueda que no se limpia y acciones fuera de pantalla a 375 px |
| UX-14 | minor | sin verificar | Vocabulario inconsistente y textos que prometen algo que el producto no hace |
| SEC-01 | blocker | partial | El alta de acceso al portal vincula en silencio a usuarios de otros tenants y revela qué correos existen (incluido el personal de plataforma) |
| SEC-02 | major | partial | Desactivación en cascada: el auth no comprueba customerAccount.active, una carrera deja membresías activas en clientes inactivos y solo el rol con MFA puede deshacerla |
| SEC-03 | major | partial | Reenvío y correo de bienvenida: acoso/phishing desde el dominio de la plataforma y anulación de tokens ajenos; cupos solo por tenant y que fallan abiertos |
| SEC-04 | major | partial | Claves de vínculo de la flota: variantes de placa/código, cruce código↔placa y renombrado de placa permiten a un rol sin MFA eludir bloqueos de cumplimiento |
| SEC-05 | major | confirmed | Usuarios externos del portal tomarán el bloqueo de creación del tenant sin límite de frecuencia ni de tamaño |
| SEC-06 | major | partial | Huecos de concurrencia e idempotencia: una membresía activa por usuario, importar dos veces, asignar vs inactivar y esperas de bloqueo sin tope |
| SEC-07 | major | partial | Un código importado puede dejar inservible de forma permanente el generador de códigos CLI- (y el SQL de referencias hace cast a int) |
| SEC-08 | major | partial | Nada en CI obliga a cumplir el checklist de 00 §4.2 en los módulos «use server» nuevos |
| SEC-09 | minor | sin verificar | Columnas sensibles nuevas de CustomerAccount viajan en filas completas y se muestran a roles que no las necesitan |
| SEC-10 | minor | sin verificar | Auditoría: los eventos de control de acceso quedan fuera de la transacción y los datos personales se copian a audit_logs |
| SEC-11 | minor | sin verificar | Higiene de entrada: NUL, bidi y ancho cero pasan los validadores; ids de ruta no UUID dan 500; el parser CSV no acota columnas ni celdas |
| SEC-12 | minor | sin verificar | Ventana de acceso a un destinatario equivocado: el acceso nace activo y los tokens de 48 h sobreviven a «Desactivar acceso» |
| INT-01 | blocker | partial | El prefijo de código CLI- ordena antes de CUST-1 y rompe service-workflow.spec.ts (customers[1]) en cuanto se cree un cliente en panatruck-demo |
| INT-02 | major | partial | La spec no define la compuerta migración→push: un push a main antes de pnpm db:deploy deja sin servicio el Resumen, la asignación y el portal |
| INT-03 | major | partial | S4a omite las trampas de undefined/null más dañinas: el findFirst del equipo, null en el preprocess y el texto del POD |
| INT-05 | major | partial | Renombrar placa: la cascada de cumplimiento por igualdad exacta pierde vínculos y permite que un vehículo herede los documentos de otro |
| INT-06 | major | partial | Importación CSV: skipDuplicates oculta pérdidas, los vehículos tienen dos claves únicas, los clientes ninguna, y Excel en español rompe acentos y decimales |
| INT-07 | major | partial | Los viajes de operaciones inundan el portal: empujan fuera del take:10 las solicitudes accionables y desplazan el «viaje activo» |
| INT-08 | major | confirmed | Estados intermedios del portal sin salida: «Solo consulta» ve un formulario que no funciona y el acceso desactivado termina en un login mudo |
| INT-09 | major | confirmed | driver/page.tsx: driverId undefined muestra todos los viajes del tenant a un DRIVER sin perfil, y ninguna pantalla vincula usuario↔conductor en un tenant real |
| INT-10 | major | confirmed | Acceso al portal: la matriz de reglas tiene un hueco (mismo cliente, otro rol) y las comprobaciones no están serializadas |
| INT-11 | minor | sin verificar | El reintento y la idempotencia de Nuevo viaje dependen de meta.target de Prisma, que la spec no verifica |
| INT-12 | minor | sin verificar | Concurrencia de catálogos: asignar vs inactivar, plantillas duplicadas y un mensaje de bloqueo erróneo |
| INT-13 | minor | sin verificar | Tipos de servicio: contradicción con el seed, nombres duplicables y una promesa de autorización que no existe |
| INT-14 | minor | sin verificar | Desactivación, hora y textos que dejan datos engañosos |
| TEST-01 | blocker | partial | No hay capa de pruebas con BD real: aislamiento, límite de plan, referencias e idempotencia solo se probarían con mocks que no pueden fallar por esas causas |
| TEST-02 | blocker | partial | No existe plan ni dueño de E2E para la Fase 1: el KPI (b) no es verificable y crear catálogos en Panatruck rompe E2E-FLOW-003 de forma permanente |
| TEST-03 | major | partial | CI: el E2E nunca ha corrido y el workflow CI está en rojo por el job de auditoría; las pruebas nuevas solo tendrían señal remota en el job verify |
| TEST-04 | major | partial | isUniqueViolation(error, fieldHint) depende de meta.target, cuya forma real nunca se ha verificado, y el doble envío siempre pasa por esa rama |
| TEST-05 | major | partial | Carreras «desactivar vs usar» sin diseñar ni probar: viaje asignado a un vehículo INACTIVO o creado para un cliente desactivado |
| TEST-06 | major | partial | Zona horaria: la verificación depende de ejecutar dos veces a mano, CI y el equipo de desarrollo cubren zonas distintas y el E2E local nunca reproduce UTC |
| TEST-07 | major | partial | ServerForm: envío antes de hidratar (GET con datos personales en la URL), redirect que no «lanza» en el cliente y esperas E2E sin definir |
| TEST-08 | major | partial | El KPI (b) es inalcanzable por el camino guiado: la lista de arranque omite el equipo aunque 4 de las 5 plantillas lo exigen |
| TEST-09 | major | partial | Importación CSV: ninguna prueba usa bytes que no sean UTF-8, y Excel en español guarda en Windows-1252 con punto y coma |
| TEST-10 | major | confirmed | Contrato de selectores incompleto: TableRow no admite data-testid (sin dueño) y varios labels colisionan por subcadena dentro de la misma página |
| TEST-11 | major | partial | Verificación de correo: nada en el repo lee Mailpit, no hay preflight, y el usuario existente de otro tenant recibe un acceso invisible |
| TEST-12 | major | partial | Limpieza y guardas: global-setup sin guarda de destino, cleanup sin cobertura de fixtures y selección de tenant con findFirst sin orden |
| TEST-13 | minor | sin verificar | security:check: cadenas prohibidas dictadas por la propia spec pueden romper el único gate remoto verde, y las reglas de diseño dependen de la disciplina de cada agente |
| TEST-14 | major | partial | La matriz de verificación final carece de criterios automatizables de accesibilidad, visual y consola, de línea base y de una lista honesta de lo no verificable |

Defectos preexistentes detectados: `DRIVER` sin ficha ve todos los viajes del tenant (`driver/page.tsx`); invitaciones envían enlace a `/invitacion/<token>` inexistente; el portal exige datos de contenedor para cualquier tipo de servicio.
