# ADR-008: Baseline de seguridad y rate limiting persistente

Fecha: 2026-07-09
Estado: Aceptada

## Contexto

Antes de un piloto, la plataforma debe endurecer la superficie web actual: headers de seguridad, protección contra CSRF/Origin en endpoints mutables, uploads verificados, rate limiting persistente, redacción de logs y protección explícita contra las amenazas del modelo formal (`docs/THREAT_MODEL.md`).

## Decisiones

1. **Headers globales en `next.config.ts`** (CSP con `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictivo, `COOP`, `CORP`). CSP condicional dev/prod (`unsafe-eval` solo en dev). HSTS diferido hasta producción con TLS.
2. **Rate limiting persistente en PostgreSQL** vía tabla `rate_limit_buckets` con contrato `RateLimitProvider`:
   - `PostgresRateLimitProvider` como implementación por defecto.
   - Fail-closed en scopes `auth.*`; fail-open en operativos.
   - Scopes aplicados: `auth.login` (10/min por correo), `offline.sync` (30/min por tenant+user+IP), `document.download` (60/min), `proof.download` (30/min).
3. **Verificación de Origin/Host** en route handlers mutables (`src/lib/server/http-security.ts`). Server Actions siguen usando la protección nativa de Next.
4. **Uploads**: MIME declarado ↔ magic bytes reales (`detectMimeFromMagicBytes`), 32 B – 5 MB, extensión coherente con MIME, `Content-Disposition: attachment`, ruta final generada por servidor.
5. **Firma como PNG con longitud mínima** validada tanto al persistir como al embeber en el POD PDF.
6. **Logger con redacción centralizada** (`src/lib/server/logger.ts`) para trazas técnicas; auditoría operativa sigue en `audit_logs`.
7. **Service worker restrictivo**: nunca cachea `/api`, `/platform`, `/t/*`, MinIO; solo shell público; elimina caches viejos.
8. **Códigos de error seguros** (`src/lib/server/errors.ts`) devueltos hacia el cliente; los detalles quedan en logs.
9. **`nodemailer` actualizado** a `9.0.3` (parches SMTP command injection y CRLF headers).

## Alternativas descartadas

- **Middleware global de Next.js para CSRF**: agregaría complejidad y podría interferir con Server Actions ya protegidas. Los controles se aplican donde faltan (route handlers).
- **Redis para rate limit desde ya**: no es local-first y el volumen actual no lo justifica. El contrato `RateLimitProvider` permite el intercambio futuro sin tocar callsites.
- **ClamAV integrado**: fuera de alcance de esta fase. Se define abstracción y estados `PENDING_SCAN → CLEAN/REJECTED` para adopción futura.

## Consecuencias

- Nueva tabla `rate_limit_buckets` (parte de la migración `20260709180000_offline_sync_and_rate_limit`).
- Nuevos módulos: `logger`, `errors`, `http-security`, `rate-limit`.
- CSP puede requerir ajustes cuando se agreguen dominios externos (documentar excepciones).
- `pnpm security:check`, `pnpm security:test`, `pnpm security:audit` disponibles para verificación local continua.
- Vulnerabilidades transitivas (`fast-xml-parser` vía AWS SDK, `postcss` vía Next, `effect` vía Prisma) documentadas como riesgo residual sin ruta directa de explotación.
