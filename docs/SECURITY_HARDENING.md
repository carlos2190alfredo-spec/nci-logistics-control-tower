# SECURITY HARDENING — Controles agregados en esta fase

Fecha: 2026-07-09
Base de comparación: commit `0242abf`.

## Autenticación

- Rate limit persistente por `email` (30/min) en `loginAction` con `PostgresRateLimitProvider`. En producción se recomienda reducir a 10/min y agregar límite por IP.
- Delay constante (`250 ms`) en credenciales inválidas o rate-limited para evitar enumeración por tiempo.
- Mensaje genérico "Credenciales invalidas".
- Argon2id ya en uso (sin cambios). Token de sesión sigue siendo opaco + hash SHA-256 en DB.

## Sesiones

- Cookie `httpOnly`, `sameSite: lax`, `secure` en producción, expiración 7 días.
- Endpoint `/driver/sync` re-verifica sesión y whitelist de roles en cada request.
- Sync client detecta 401/403 y no reintenta silenciosamente; el usuario debe reautenticarse.

## CSRF / Origin

- Server actions de Next validan Origin automáticamente en producción.
- Route handlers mutables (`/driver/sync`) usan `verifyMutationOrigin` (Origin whitelisted + Host match, o `Sec-Fetch-Site: same-origin`) — probado con `OFFLINE-E2E-005`.
- Content-type `application/json` obligatorio; formularios rechazados en endpoints JSON.

## Headers globales (`next.config.ts`)

- `Content-Security-Policy` con `frame-ancestors 'none'`, `object-src 'none'`, `script-src` sin `unsafe-eval` en producción.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` niega camera/geolocation/microphone/payment/usb.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- `/api/*` con `Cache-Control: no-store`.
- `/sw.js` con `Cache-Control: no-cache` y `Service-Worker-Allowed: /`.

## Uploads

- MIME declarado ↔ magic bytes reales validados en servidor (`detectMimeFromMagicBytes`).
- Extensión debe coincidir con el MIME.
- Tamaño 32 B – 5 MB.
- Ruta final por servidor con prefijo por tenant (`tenants/{slug}/trips/{ref}/...`).
- `Content-Disposition: attachment; filename="…"` en subidas y descargas para evitar renderizado inline.
- Firma como data URL PNG con longitud mínima (200 B) — rechaza SVG/JPEG/otros.

## MinIO / signed URLs

- TTL reducido a 60 s (antes 300 s).
- Cliente pide `documentId`; el servidor resuelve `objectKey`. Ningún endpoint acepta `objectKey` del cliente.
- Content-disposition controlado por servidor en presign.
- Route handlers de descarga con rate limit (60/min documentos, 30/min POD por (tenant, user, IP)) y auditoría (`document.download`, `proof.download`).
- 303 See Other + `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` en redirect a signed URL.

## POD PDF

- Firma capturada como PNG y embebida en el PDF (`doc.image(dataUrl, ...)`).
- Validación de longitud mínima previa; si la firma es inválida el PDF muestra "Sin firma valida capturada" en lugar de omitir la sección.
- SignaturePad inicia en blanco (sin trazo demo) con marca digital de captura.

## Logs

- Logger centralizado con redacción (`src/lib/server/logger.ts`): reemplaza contraseñas, tokens, cookies, firmas base64, signed URLs, secretos. Trunca strings largas.
- Todos los mensajes salen como JSON estructurado; los eventos operativos siguen en `audit_logs`.

## Service worker

- v2 con lista de rutas privadas (`/api/`, `/platform`, `/t/`) y hosts MinIO en `PRIVATE_HOST_PATTERNS` que NUNCA se cachean.
- Sin fallback a caché para peticiones privadas.
- Elimina caches viejos al activar (`caches.keys()` filtrado).
- No cachea respuestas con `type != "basic"`.
- Solo cachea GET del shell público (`/`, `/login`, `/manifest.webmanifest`).

## Errores

- Códigos en `src/lib/server/errors.ts` (`AUTH_REQUIRED`, `SESSION_EXPIRED`, `ACCESS_DENIED`, `RESOURCE_NOT_FOUND`, `STATE_CONFLICT`, `ASSIGNMENT_CHANGED`, `INVALID_PAYLOAD`, `RATE_LIMITED`, `UPLOAD_REJECTED`, `SYNC_RETRYABLE`, `SYNC_REJECTED`, `ORIGIN_MISMATCH`, `PAYLOAD_TAMPERED`).
- Los mensajes al cliente no exponen SQL, stacks, rutas internas ni IDs de otros tenants.

## Dependencias

- `nodemailer` actualizado a `9.0.3` (parches SMTP command injection y CRLF headers).
- Vulnerabilidades transitivas restantes documentadas en `pnpm audit` y en el threat model; sin ruta de explotación en la superficie actual.

## Herramientas

- `pnpm security:check` — comprobaciones estáticas (grep + configuración): sin `queryRawUnsafe`, sin `dangerouslySetInnerHTML`, sin `.env` versionados, sin secretos aparentes, headers de seguridad, cookies seguras, SW seguro, Origin en endpoints mutables, magic bytes en uploads, TypeScript sin errores.
- `pnpm security:test` — corre la suite `offline-sync` (idempotencia, Origin, IDOR, headers).
- `pnpm security:audit` — `pnpm audit --prod` (no-fail; documenta y consulta manualmente).
