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

## Pendiente (no implementado)
- Pruebas con BD real para lo que un mock no demuestra (límite de plan y referencias bajo concurrencia, forma real del `P2002`), E2E de roles/aislamiento entre tenants/límites de plan, y `e2e:cleanup` ampliado.
- Motor de recomendación de conductores en hora de Panamá (BIZ-08), reglas de identidad de placa/código más estrictas (SEC-04), y el portal sigue exigiendo datos de contenedor para cualquier tipo de servicio.
- Invitaciones: el enlace apunta a `/invitacion/<token>`, que no existe (preexistente; no se tocó).
- Despliegue: backup + `pnpm db:deploy` en Supabase staging y `harden.sql` ANTES de cualquier push (Production y Preview comparten BD). Las cifras de plan (`tenant_plans`) no tienen validación comercial y ahora bloquean altas de vehículos/clientes: confirmarlas antes del primer tenant real.

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
