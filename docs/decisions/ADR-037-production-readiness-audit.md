# ADR-037: Remediación de la auditoría de preparación para producción

Estado: Aceptado
Fecha: 2026-11-13
Relacionado: ADR-033 (verificación de correo), ADR-035 (excepciones y bloqueo optimista), ADR-036 (staging en la nube)

## Contexto

Antes de promover el staging de ADR-036 a producción se hizo una auditoría de solo lectura con
seis lentes independientes (autorización y tenants, secretos en un repo público, compatibilidad
con Vercel, sondeo del sitio en vivo, preparación operativa y calidad del frontend). Dos
verificadores intentaron refutar cada hallazgo.

- 46 hallazgos: 40 confirmados, 2 en disputa y 4 descartados.
- Ninguno crítico; 7 altos y el resto medios o bajos.
- Cinco grupos de archivos disjuntos implementaron las correcciones; cada grupo lo revisaron dos
  revisores independientes, que levantaron 28 observaciones. Se corrigieron todas las bloqueantes y
  mayores y la mayoría de las menores.

## Decisión

### Correo
- **Un solo transporte** (`src/lib/server/mail.ts`) para notificaciones, restablecimiento de
  contraseña, alertas, invitaciones y bienvenida. Respeta `MAIL_USER`, `MAIL_PASSWORD`,
  `MAIL_SECURE` y el puerto 465 (Resend: `smtp.resend.com`, usuario `resend`) y tiene timeouts.
  Fuera de local falla con un error claro si falta `MAIL_HOST` o `MAIL_FROM`.
- **El correo nunca aborta una acción ya confirmada.** La fila de entrega termina en `SENT` o
  `FAILED`; los fallos se registran y se auditan; la acción devuelve un aviso, no un error.
- **Ningún correo lleva una contraseña.** Las cuentas nuevas nacen con una contraseña aleatoria
  desconocida y reciben un enlace de un solo uso (48 h) para definir la suya. Esto sustituye la
  contraseña temporal descrita en ADR-033.
- Los valores interpolados en correos HTML se escapan; el correo saliente de alta se limita a 50 por
  tenant y hora.
- `getAppBaseUrl()` (`NEXT_PUBLIC_APP_URL`, luego `APP_URL`, luego `VERCEL_PROJECT_PRODUCTION_URL`)
  reemplaza los fallbacks a `localhost`; fuera de local lanza si no hay nada configurado.

### Autorización y flujo de evidencia
- Regla de roles (`membership-rules.ts`, pura y probada): solo un `TENANT_OWNER` concede o modifica
  ese rol; nadie cambia su propio rol ni se desactiva; no se puede dejar al tenant sin propietario.
  "Crear usuario" no agrega roles a quien ya es miembro del tenant.
- Las páginas operativas exigen `tenant.view`: un conductor ya no abre el centro de control por
  URL (se le redirige a `/driver`). `TripEvent.reason` se oculta a roles sin permiso de excepciones.
- `/api/sync/actions` aplica el mismo control de tenant activo y de MFA que el resto.
- **La evidencia del conductor nace `INTERNAL`**; solo `approveProofAction` la publica al cliente
  (junto con el POD) y el rechazo la devuelve a `INTERNAL`. El POD se distingue de la evidencia por
  su clave de objeto (`/pod/`), no por el MIME: el conductor también puede subir PDFs.
- Las transiciones a `EVIDENCE_SUBMITTED` y `EVIDENCE_APPROVED` solo existen por sus flujos
  dedicados; `CLOSED` exige prueba aprobada (`proofReady`).
- La ruta de fotos offline valida con `validateUploadedFile` (MIME, extensión y magic bytes) y las
  guarda `INTERNAL`.

### Límites de subida en Vercel
- Las funciones aceptan ~4,5 MB por petición. Archivo máximo **3 MiB** en el servidor y
  `serverActions.bodySizeLimit = 4mb`; el navegador reduce y recodifica las fotos a JPEG hasta que
  quepan y muestra un error claro si no es posible.

### Tareas programadas, salud y límites de uso
- Cron diario (`vercel.json`, `0 9 * * *`, válido en cualquier plan) hacia
  `/api/internal/cron/maintenance`, protegido con `Authorization: Bearer <CRON_SECRET>` (503 si falta):
  reescanea archivos atascados, purga `rate_limit_buckets` vencidos y levanta o resuelve una alerta
  de salud. Sus documentos tardíos nacen `INTERNAL`.
- `/api/internal/health` público usa una caché en memoria de ~20 s con una sola ejecución
  compartida; el contrato 200/503 y el cuerpo mínimo no cambian.
- El límite de uso es una sola sentencia atómica (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).

### Entorno, datos y operación
- **Perfil fail-closed** (`src/lib/app-env.ts`): un `APP_ENV` inválido lanza; sin `APP_ENV`,
  `NODE_ENV=production` resuelve a `production` (nunca a `local`). `keyedHash` exige
  `SESSION_METADATA_KEY` fuera de local.
- Seed y scripts demo imprimen el destino y rechazan un host remoto con el perfil local; `db:reset`
  rechaza cualquier host remoto, sin excepción posible.
- Arranque real sin seed demo: `pnpm prod:bootstrap` (planes y primer `PLATFORM_SUPER_ADMIN` desde
  variables de entorno), `pnpm db:deploy` (con `CONFIRM_DB_HOST`) y `pnpm demo:purge` (dry-run por
  defecto) para retirar las cuentas demo antes de operar con clientes reales.
- Respaldos contra Postgres remoto (`BACKUP_DATABASE_URL`, `pg_dump` local o en Docker, cifrado
  AES-256-GCM) con simulacro de restauración en un Postgres local descartable. **Primer simulacro
  real contra Supabase staging el 2026-11-13: 70 tablas restauradas y filas verificadas.**

### Frontend
- `public/sw.js` pasa de lista de exclusión a **lista blanca** (solo el shell público y estáticos);
  nunca cachea `/account`, `/mfa`, `/t/*`, `/platform` ni `/api/*`. Versión de caché `nci-lct-v4`.
- `robots.ts`, `sitemap.ts` y los metadatos solo permiten indexar con `APP_ENV=production`.
- Metadatos, contraste AA corregido, acentos y páginas 404 y de error en español y con la marca.

## Consecuencias

- Variables nuevas en Vercel: `CRON_SECRET` (≥ 16 caracteres), `OPS_ALERT_EMAIL`, y las ya
  conocidas pendientes (`MAIL_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`). `APP_ENV=production`
  debe existir también en el build para que el sitio sea indexable; sin ella queda en `noindex`.
- Cuentas de propietario o administrador sin MFA son enviadas al alta de MFA también en la API de
  sincronización (devuelve 403).
- Pendiente a propósito:
  - Mapear HTTP 413 como terminal en `photo-sync-engine.ts`.
  - Restricción FK compuesta `(tenantId, serviceTypeId)` (requiere migración).
  - Imagen social (`og:image`).
  - Programar los respaldos en un equipo autorizado: nada corre solo.
  - CSP sin `unsafe-inline` (requiere nonces).
- Para producción real con clientes se recomienda un proyecto Supabase nuevo (no promover el de
  staging) y retirar los datos demo con `demo:purge`.
