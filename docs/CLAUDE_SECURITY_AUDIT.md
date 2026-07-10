# CLAUDE SECURITY AUDIT — Auditoría independiente

Fecha: 2026-07-10
Auditor: Claude Opus 4.7 (revisión independiente)
Commit auditado: `0141575`
Alcance: autenticación, autorización, multitenancy, endpoint offline sync, uploads/MinIO, service worker, IndexedDB, headers, rate limiting, logs, dependencias.

## Metodología

Estática por lectura de código y contratos. Verificación dinámica cuando aplica (curl de headers, `pnpm audit --prod --json`, `pnpm view` de cadenas de dependencias). Los baselines siguen verdes:

- `pnpm lint`, `pnpm typecheck`: sin errores.
- `pnpm test`: 21/21.
- `pnpm security:check`: 10/10.
- `git status`: limpio. `git remote -v`: sin remotes.
- Docker: PostgreSQL/MinIO/Mailpit saludables.

## Herramientas y comandos utilizados

- `pnpm audit --prod --json` → 9 advisories.
- `pnpm view <paquete> dependencies` para trazar cadenas.
- `pnpm view <paquete> versions --json` para identificar versiones parcheadas.
- Lectura de `src/lib/server/{auth,offline-sync,storage,http-security,rate-limit,pod-pdf,logger,errors}.ts`, route handlers, `next.config.ts`, `public/sw.js`, `prisma/schema.prisma`.

## Resumen ejecutivo

- 9 vulnerabilidades de dependencia; **7 se eliminan al actualizar AWS SDK** (nuevas versiones de `@aws-sdk/xml-builder` ya no dependen de `fast-xml-parser`). Las 2 restantes son `effect` (Prisma CLI, build-time) y `postcss` (Next+geist CSS pipeline, build-time). Ambas NOT_REACHABLE_IN_CURRENT_USAGE / BUILD_TIME_ONLY.
- 1 hallazgo P0 confirmado en el flujo de idempotencia offline (race window entre `findUnique` del receipt y `trip.update`).
- 3 hallazgos P1 en autenticación: no hay rotación de sesión post-login, no hay invalidación de sesiones al cambiar contraseña, sin flujo de recuperación.
- Ninguna vulnerabilidad de aislamiento multitenant detectada (los guards server-side y filtros por `tenantId` cubren los patrones auditados).
- Sin `dangerouslySetInnerHTML` ni SQL raw en el código de aplicación.

## Hallazgos

### VULN-001: Race condition permite doble evento con misma idempotencyKey

- **ID**: VULN-001
- **Título**: `processOfflineBatch` puede crear dos `tripEvent` con la misma `idempotencyKey` si dos requests concurrentes llegan antes del commit del primero.
- **Severidad**: alta
- **Alcanzabilidad**: REACHABLE_CONFIRMED
- **Componente**: `src/lib/server/offline-sync.ts` (líneas 254–310, dentro de `processOfflineBatch` → `processTransition` → `persistReceipt`).
- **Descripción**: el flujo es (1) `findUnique(receipt)`; (2) si no existe, ejecutar `processTransition` que abre una transacción, hace `trip.update`, `tripEvent.create` y termina con `receipt.upsert`. Como el `upsert` usa `create-or-update`, un segundo request con la misma clave que llegue en la ventana entre el `findUnique` del primero y su `commit` verá `existing = null`, entrará a `processTransition`, ejecutará su propio `trip.update` + `tripEvent.create`, y al llegar a `receipt.upsert` hará **UPDATE {}** (no-op) sin abortar la transacción, dejando dos eventos.
- **Evidencia**:
  ```
  offline-sync.ts:257  const existing = await getDb().offlineCommandReceipt.findUnique(...)
  offline-sync.ts:267  if (existing) { ... continue; }
  offline-sync.ts:125  const eventId = await db.$transaction(async (tx) => {
  offline-sync.ts:126    await tx.trip.update(...)     // ejecutado antes del check UNIQUE
  offline-sync.ts:134    await tx.tripEvent.create(...) // ← doble evento
  offline-sync.ts:145    await persistReceipt(tx, ...)  // upsert = UPDATE {} si existe
  ```
- **Escenario de ataque**: un cliente offline que sincroniza dos veces el mismo comando (retry apresurado, doble tap del botón en red inestable, malware que reenvía requests). Resultado: doble hito visible en la línea de tiempo del cliente y doble contabilización operativa.
- **Impacto**: integridad del historial operativo; consultas y facturación futuras basadas en `tripEvent` verán duplicados.
- **Corrección recomendada**: mover la creación del receipt **al principio** de la transacción con `create` (no `upsert`) para que el UNIQUE dispare antes del `trip.update`. Alternativa: `SELECT ... FOR UPDATE` sobre el receipt dentro de la tx.
- **Pruebas requeridas**: unit sobre `processOfflineBatch` disparando dos ejecuciones simultáneas del mismo comando (Promise.all) contra la DB de test; asertir un solo `tripEvent`.
- **Estado**: P0 — remediar en esta fase.

### VULN-002: Login no rota ni invalida sesiones previas del usuario

- **ID**: VULN-002
- **Título**: `signIn` crea una nueva sesión pero no revoca las sesiones activas anteriores del mismo usuario.
- **Severidad**: alta
- **Alcanzabilidad**: REACHABLE_CONFIRMED
- **Componente**: `src/lib/server/auth.ts:12-58`.
- **Descripción**: al iniciar sesión, la cookie del navegador que hace login queda sobreescrita, pero cualquier sesión activa del mismo usuario en otro dispositivo (o cookie previa en el mismo navegador antes del login) **no** se revoca. Esto crea:
  1. Riesgo de session fixation parcial: si el atacante plantó una cookie con un token válido de sí mismo en el navegador de la víctima (por XSS en subdominio), su sesión propia sigue viva en su navegador después de que la víctima "toma control" del navegador.
  2. Riesgo residual en dispositivo compartido: usuario A entra, se olvida de cerrar; usuario B entra en el mismo navegador; A recupera su cookie de otra fuente y accede.
- **Evidencia**: `signIn` solo hace `session.create` — no llama `updateMany` sobre sesiones existentes del usuario.
- **Escenario de ataque**: dispositivo compartido físicamente.
- **Impacto**: acceso persistente no autorizado a la cuenta después de un login legítimo.
- **Corrección recomendada**: revocar la sesión asociada al token pre-existente en la cookie (si venía) antes de crear la nueva; **exponer** la política en la UI de gestión de sesiones activas.
- **Pruebas requeridas**: E2E que crea una sesión, guarda su cookie, hace nuevo login en el mismo browser context (nueva cookie), reintenta con la cookie antigua → 401/redirect a login.
- **Estado**: P1 — remediar en esta fase.

### VULN-003: No hay flujo de recuperación de contraseña

- **ID**: VULN-003
- **Título**: no existe recuperación de contraseña; la tabla `password_reset_tokens` existe en el schema pero no hay UI, endpoints ni flujo.
- **Severidad**: media
- **Alcanzabilidad**: REACHABLE_CONFIRMED (funcionalidad ausente).
- **Componente**: schema `PasswordResetToken`; sin código consumidor.
- **Descripción**: un usuario que olvida su contraseña no tiene forma segura de recuperar acceso. Solo el administrador de plataforma (que puede modificar el hash directamente en DB) podría restaurar acceso; ese proceso no es auditable ni escalable.
- **Escenario de ataque**: soporte técnico crea contraseñas temporales por canal informal (email/chat) — expone credenciales y facilita phishing interno.
- **Impacto**: presión operacional para procesos inseguros y riesgo de escalada por soporte.
- **Corrección recomendada**: implementar flujo local con Mailpit — solicitar → correo con URL con token → reset → invalidar todas las sesiones. Respuesta neutral idéntica exista o no el correo. Token único con hash SHA-256, TTL 20-30 min, `used_at` + `revoked_at`, rate limit por email y por IP.
- **Pruebas requeridas**: E2E de flujo completo + negativas (correo inexistente, token vencido, token reutilizado, alterado, rate limit).
- **Estado**: P1 — remediar en esta fase.

### VULN-004: Cambio de contraseña no invalida sesiones (no existe todavía)

- **ID**: VULN-004
- **Título**: cuando se implemente cambio o reset de contraseña, todas las sesiones activas del usuario deben invalidarse; hoy no hay este flujo, pero al implementarlo es obligatorio.
- **Severidad**: alta
- **Alcanzabilidad**: DEPENDIENTE de VULN-003.
- **Componente**: auth.ts (a implementar).
- **Corrección recomendada**: helper `revokeAllUserSessions(userId)` invocado desde change-password y reset-password.
- **Estado**: P1 — implementar junto con VULN-003.

### VULN-005: Sin gestión de sesiones activas para el usuario

- **ID**: VULN-005
- **Título**: no existe una pantalla para que el usuario vea sus sesiones activas ni pueda cerrarlas remotamente.
- **Severidad**: media
- **Alcanzabilidad**: REACHABLE_CONFIRMED (funcionalidad ausente).
- **Componente**: UI + endpoints.
- **Descripción**: `Session` no persiste `userAgent` ni `ipHash`; no hay endpoints para listar/cerrar sesiones específicas.
- **Escenario de ataque**: usuario víctima de robo de cookie no tiene forma de expulsar la sesión maliciosa; queda vigente hasta expirar (7 días).
- **Corrección recomendada**: agregar `userAgent` + `ipHash` en Session; página `/account/sessions` con lista, "cerrar una", "cerrar todas las demás", "cerrar todas". Auditar cada revocación.
- **Pruebas requeridas**: E2E de listar/cerrar/cerrar-todas.
- **Estado**: P1 — remediar en esta fase.

### VULN-006: X-Forwarded-For sin sanitizar detrás de proxy

- **ID**: VULN-006
- **Título**: `clientIpFrom` toma el primer valor del header `X-Forwarded-For` tal cual del cliente.
- **Severidad**: media (baja en localhost; alta si se despliega detrás de proxy no confiable)
- **Alcanzabilidad**: BUILD_TIME_ONLY en dev (Next dev no lee este header desde origen no confiable); POTENTIALLY_REACHABLE en despliegue.
- **Componente**: `src/lib/server/http-security.ts:66-70`.
- **Descripción**: en producción detrás de nginx/haproxy, un atacante puede enviar `X-Forwarded-For: 1.2.3.4` para eludir el rate limit basado en IP.
- **Corrección recomendada**: documentar que el proxy debe **sobrescribir** (no anexar) XFF; agregar variable `TRUSTED_PROXY_HOPS` para saltar N hops. Registrar como decisión de despliegue.
- **Estado**: P2 — documentar; ajustar al desplegar tras proxy.

### VULN-007: `currentServerState` en respuesta `ASSIGNMENT_CHANGED` filtra estado

- **ID**: VULN-007
- **Título**: cuando el conductor B envía comando para un tripId asignado al conductor A, la respuesta incluye `currentServerState: trip.status`.
- **Severidad**: baja
- **Alcanzabilidad**: REACHABLE_CONFIRMED (verificado en E2E OFFLINE-E2E-007).
- **Componente**: `src/lib/server/offline-sync.ts:91-95, 186-188`.
- **Descripción**: la respuesta permite al conductor B enumerar estados de viajes que no le pertenecen probando tripIds. Es una filtración menor pero elimina la protección `RESOURCE_NOT_FOUND` genérica.
- **Corrección recomendada**: omitir `currentServerState` cuando el error es `ASSIGNMENT_CHANGED`.
- **Estado**: P2 — remediar en esta fase (bajo costo).

### VULN-008: IndexedDB del conductor puede contener datos residuales tras cambio de usuario

- **ID**: VULN-008
- **Título**: el owner index se calcula por `userId::tenantId::driverId`, aislando datos por sesión; pero si usuario B entra en el mismo navegador, los datos de A permanecen en el store hasta expirar/purgar.
- **Severidad**: baja
- **Alcanzabilidad**: POTENTIALLY_REACHABLE (dispositivo compartido).
- **Componente**: `src/lib/offline/db.ts`, `src/components/offline/logout-guard.tsx`.
- **Descripción**: `safeCleanupOnLogout` purga solo si no hay pendientes. Un login posterior de otro usuario no ve datos ajenos (owner filter), pero la data cruda sigue en IndexedDB del dispositivo.
- **Corrección recomendada**: en login, ejecutar cleanup del owner anterior si es distinto (mejor esfuerzo, sin bloquear login). Ya está aceptado como riesgo residual en OFFLINE_SECURITY.
- **Estado**: P2 — documentar mejora; no bloquea piloto.

### VULN-DEP-001: `fast-xml-parser@5.2.5` (crítica + altas) transitivas de AWS SDK

- **ID**: VULN-DEP-001
- **Módulo**: `fast-xml-parser`
- **Instalada**: `5.2.5`. **Fixadas**: `>=5.3.4` (DoS), `>=5.3.5` (crítico regex bypass DOCTYPE), `>=5.3.6`, `>=5.5.6`, `>=5.5.7`, `>=5.7.0`.
- **Cadena**: `@aws-sdk/client-s3@3.946.0 > @aws-sdk/core > @aws-sdk/xml-builder@3.930.0 > fast-xml-parser@5.2.5`.
- **Alcanzabilidad**: POTENTIALLY_REACHABLE. AWS SDK parsea XML de respuestas de S3. Si un atacante controla las respuestas (MinIO comprometido), podría explotar el bypass DOCTYPE. En nuestro despliegue local con MinIO gestionado internamente, la superficie es prácticamente cero, pero por el principio de defensa en profundidad conviene actualizar.
- **Fix disponible**: `@aws-sdk/xml-builder@3.972.34` y superiores **no dependen de fast-xml-parser** (verificado con `pnpm view`). Actualizar `@aws-sdk/client-s3` a la última minor de 3.x cierra las 7 advisories asociadas.
- **Corrección recomendada**: `pnpm add @aws-sdk/client-s3@latest @aws-sdk/s3-request-presigner@latest`; ejecutar `pnpm audit` para verificar; correr suite completa.
- **Estado**: P1 — remediar en esta fase.

### VULN-DEP-002: `effect@3.18.4` (alta) transitiva de Prisma CLI

- **ID**: VULN-DEP-002
- **Módulo**: `effect`
- **Instalada**: `3.18.4`. **Fixada**: `>=3.20.0`.
- **Cadena**: `@prisma/config@6.19.1 > effect@3.18.4`.
- **Alcanzabilidad**: **NOT_REACHABLE_IN_CURRENT_USAGE / BUILD_TIME_ONLY**. `@prisma/config` se ejecuta solo por el CLI de Prisma (migrate, generate) durante desarrollo y CI. No participa del bundle de servidor de Next.js. El advisory es una pérdida de contexto en AsyncLocalStorage bajo condiciones específicas: no aplicable a nuestro uso (que es CLI en pasos discretos).
- **Fix disponible**: Prisma major 7 usa `@prisma/config@7.8.0`. Es un major upgrade con cambios en config y engines: riesgo de regresión alto para un problema build-time no explotable.
- **Corrección recomendada**: **aceptar** con seguimiento — verificar cada mes si Prisma 6.19.x publica un patch. Documentar en `DEPENDENCY_REACHABILITY.md`.
- **Estado**: NO ALCANZABLE — documentado.

### VULN-DEP-003: `postcss@8.4.31` (moderada) transitiva de Next.js + geist

- **ID**: VULN-DEP-003
- **Módulo**: `postcss`
- **Instalada**: `8.4.31`. **Fixada**: `>=8.5.10`.
- **Cadena**: `next@16.2.10 > postcss@8.4.31` y `next > geist@1.5.1 > (indirect)`.
- **Alcanzabilidad**: **BUILD_TIME_ONLY**. La vulnerabilidad es XSS vía `</style>` no escapado en `Stringify`. Se ejecuta al procesar CSS durante build (`next build`). Nuestro CSS es 100% estático y no acepta input de usuario en tiempo de build. Sin ruta de explotación.
- **Fix disponible**: parche transitivo depende de Next.js publicar una nueva versión con `postcss@>=8.5.10`. Cadena controlada por Next.
- **Corrección recomendada**: **aceptar** con seguimiento. Documentar cadena y condición para reevaluar.
- **Estado**: NO ALCANZABLE — documentado.

## Verificaciones estáticas superadas

- Sin `dangerouslySetInnerHTML` en `src/`.
- Sin `queryRawUnsafe` / `$executeRawUnsafe` en `src/` (solo aparecen en el cliente Prisma generado como métodos públicos).
- Sin `.env` versionados.
- Sin secretos aparentes en código versionado (patrones AKIA, RSA/DSA/EC PRIVATE KEY, `ghp_`).
- Cookies de sesión con `httpOnly: true`, `sameSite: "lax"`, `secure` en producción.
- Service worker no cachea `/api/*`, `/platform`, `/t/*`, ni hosts MinIO.
- Endpoints mutables validan Origin.
- Storage valida magic bytes.

## Cobertura E2E existente (10 anteriores + 9 nuevos = 19)

- Aislamiento multitenant, aislamiento por cliente, restricción de conductor, POD cross-tenant/cross-customer → todos verdes.
- Idempotencia, PAYLOAD_TAMPERED, Origin rechazado, payload inválido, ASSIGNMENT_CHANGED → todos verdes.
- Sin cobertura previa de: rotación de sesión, recuperación de contraseña, gestión de sesiones activas, race condition en receipts. Se agregarán en Parte B.

## Conclusión

El sistema tiene una base de seguridad sólida en la fase previa. Los hallazgos críticos/altos alcanzables son 1 (race receipts) + gaps de autenticación (sin rotación, sin recuperación, sin gestión de sesiones). Las 9 vulnerabilidades de dependencia se reducen a 2 no alcanzables tras actualizar AWS SDK. Nada bloquea la remediación en esta fase.
