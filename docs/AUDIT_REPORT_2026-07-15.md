# Auditoría completa del proyecto

Fecha: 2026-07-15
Estado: **APTO PARA PRUEBA / STAGING**

## Resumen ejecutivo

Se ejecutaron 5 auditorías sobre NCI Logistics Control Tower en preparación para pruebas y despliegue de producción:

1. Infraestructura y salud del sistema
2. Integridad de build y dependencias
3. Postura de seguridad
4. Suite de tests completa
5. Flujos funcionales end-to-end

**Resultado final:** el proyecto pasa las 5 auditorías. Se identificaron y corrigieron 3 findings menores durante la ejecución (ninguno bloqueante). Los únicos ítems abiertos son de infraestructura externa (ver [`DEPLOYMENT.md`](DEPLOYMENT.md)).

---

## 1. Auditoría de infraestructura

| Check | Resultado |
| --- | --- |
| Docker: PostgreSQL 17 healthy | ✅ |
| Docker: MinIO healthy | ✅ |
| Docker: Mailpit healthy | ✅ |
| Docker: ClamAV 1.4 healthy | ✅ |
| Prisma migrations | ✅ 13/13 aplicadas |
| `pnpm app:doctor` | ✅ **27/27 checks OK, 0 warnings** |

**Finding 1 (corregido):** el doctor buscaba `public/manifest.json` pero el archivo real usa la extensión estándar PWA `manifest.webmanifest`. Corregido en `scripts/app-doctor.ts`.

---

## 2. Auditoría de build y dependencias

| Check | Resultado |
| --- | --- |
| `pnpm build` | ✅ 53 rutas construidas |
| `pnpm audit --prod` | ⚠️ 2 advisories transitivos ya documentados |
| Prisma generate | ✅ |
| TypeScript check | ✅ 0 errores |

**Advisories aceptados** (documentados en `DEPENDENCY_REACHABILITY.md`):
- `effect@3.18.4` (high) — solo build-time via Prisma CLI. `NOT_REACHABLE`.
- `postcss@8.4.31` (moderate) — solo build-time via Next+geist. `NOT_REACHABLE`.

Ambos con revisión programada 2026-10-10.

---

## 3. Auditoría de postura de seguridad

### Headers HTTP (verificados con `curl -I http://localhost:3000/login`)

| Header | Estado |
| --- | --- |
| `Content-Security-Policy` | ✅ Diferenciado dev/prod. En prod NO se incluye `unsafe-eval`. |
| `X-Content-Type-Options: nosniff` | ✅ |
| `X-Frame-Options: DENY` | ✅ |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy` | ✅ camera/geo/mic/payment/usb bloqueados |
| `Cross-Origin-Opener-Policy: same-origin` | ✅ |
| `Cross-Origin-Resource-Policy: same-origin` | ✅ |
| `Strict-Transport-Security` | ✅ **AGREGADO**: `max-age=63072000; includeSubDomains; preload` (solo prod) |
| `X-Powered-By` | ✅ **DESACTIVADO** (`poweredByHeader: false`) |
| `x-request-id` | ✅ generado por middleware para correlación |

**Finding 2 (corregido):** HSTS no estaba configurado. Agregado con activación condicional (solo prod para evitar romper `http://localhost` en dev).

**Finding 3 (corregido):** `X-Powered-By: Next.js` exponía stack. Desactivado con `poweredByHeader: false`.

### Cookies de sesión

| Flag | Valor |
| --- | --- |
| `httpOnly` | ✅ true |
| `sameSite` | ✅ lax |
| `secure` | ✅ true en prod, false en dev |
| `path` | ✅ / |
| `expires` | ✅ configurado por sesión |

### Autenticación

- ✅ Argon2id para password hashing (`memoryCost: 19456, timeCost: 2`).
- ✅ Sesiones opacas SHA-256 en Postgres, con TTL y rotación.
- ✅ MFA TOTP obligatorio para `PLATFORM_SUPER_ADMIN` y `PLATFORM_SUPPORT`.
- ✅ Secretos MFA encriptados con AES-256-GCM (`MFA_ENCRYPTION_KEY`).
- ✅ Códigos de recuperación (single-use, hashed).
- ✅ Sesiones parciales para flujo MFA.
- ✅ Revocación en cascada al cambiar contraseña.

### Rate limiting

Cubre 8 endpoints/actions críticos:
- `/api/t/[tenantSlug]/proof/[tripId]` (POD)
- `/api/t/[tenantSlug]/driver/pwa-telemetry`
- `/api/t/[tenantSlug]/driver/attachment`
- `/api/t/[tenantSlug]/driver/sync`
- `/api/t/[tenantSlug]/documents/[documentId]`
- Server actions genéricas (`actions.ts`)
- Password reset
- MFA challenges

**Nota producción:** el rate-limit usa store en memoria por instancia. Con múltiples réplicas requiere Redis compartido (documentado en `DEPLOYMENT.md`).

### Security check script

`pnpm security:check`: ✅ **55/55 checks pasan** (incluye 8 checks específicos de DeepSeek: secrets stripped, model output sanitized, no reasoning_content persisted, Zod validation, etc.).

---

## 4. Auditoría de tests

| Suite | Cantidad | Resultado |
| --- | --- | --- |
| Unit tests (Vitest) | 170 | ✅ 170/170 pasan |
| E2E — auth/isolation | 5 | ✅ 5/5 |
| E2E — service workflow + login + system status | 15 | ✅ 15/15 |
| E2E — security auth + file security + observability | 24 | ✅ 24/24 |
| E2E — offline + PWA + tenant admin + routes | 43 | ✅ 43/43 |
| **E2E total** | **87** | **✅ 87/87** |
| Security checks | 55 | ✅ 55/55 |
| Lint | — | ✅ 0 warnings, 0 errores |
| Typecheck | — | ✅ paso |

**Finding transitorio (no de código):** el primer run del test `runtime-auth-isolation` falló porque durante las pruebas manuales de sesiones anteriores se cambió el TOTP secret del super admin. Se restauró con `pnpm db:seed` y el test pasó — el bug era estado sucio de DB, no de código.

---

## 5. Auditoría funcional end-to-end

Los flujos críticos están cubiertos por E2E automatizados (todos pasando):

| Flujo | Suite | Estado |
| --- | --- | --- |
| Login + MFA + rotación de sesión | `login`, `security-auth` | ✅ |
| Aislamiento multitenant | `runtime-auth-isolation` | ✅ |
| Cliente → operaciones → conductor → POD | `service-workflow` | ✅ |
| Cola offline con idempotencia | `offline-sync` | ✅ |
| Sync de fotos PWA | `pwa-photo-sync` | ✅ |
| Cuarentena antivirus (EICAR) | `file-security` | ✅ |
| Creación tenant + verificación email | `platform-tenant-admin` | ✅ |
| Estimación ruta + recomendación conductor | `route-driver-recommendation` | ✅ |
| Dashboard system status | `system-status` | ✅ |
| Telemetría PWA + headers seguros | `observability-security` | ✅ |

**Verificación manual adicional** (documentada en sesiones previas):
- Creación de tenant "Test Logistics" con owner @test-logistics.com → email de bienvenida entregado (Mailpit).
- Enlace de verificación funciona → `emailVerified = true`.
- Login del owner → configuración MFA → login exitoso.
- Creación de usuario Maria Lopez (Dispatcher) → email entregado con enlace + contraseña temporal + rol.

---

## Cambios aplicados durante la auditoría

Se corrigieron 3 findings menores. Todos ya committeados:

1. `next.config.ts`:
   - Agregado `poweredByHeader: false`.
   - Agregado HSTS condicional (`Strict-Transport-Security`) solo en producción.
2. `scripts/app-doctor.ts`:
   - Corregido el check de PWA manifest (`manifest.webmanifest` es el nombre estándar).

---

## Estado final

| Área | Estado |
| --- | --- |
| Código | ✅ **Production-ready** |
| Cobertura de tests | ✅ 170 unit + 87 E2E + 55 security |
| Seguridad HTTP | ✅ Full headers + HSTS prod + CSP dev/prod split |
| Seguridad auth | ✅ Argon2id + sesiones opacas + MFA + rate limits |
| Aislamiento multitenant | ✅ Validado a nivel servidor + tests dedicados |
| Observabilidad | ✅ Logs estructurados + métricas + alertas + health |
| Backups | ✅ AES-256-GCM + DR drill scripts |
| Documentación | ✅ 33 ADRs + DEPLOYMENT.md + CURRENT_STATE + BACKLOG |
| CI/CD | ✅ GitHub Actions workflows listos |
| `.env.example` | ✅ 40+ variables documentadas |

## Pendientes (todos externos al código)

- Remote Git + CI conectado.
- PostgreSQL managed.
- Bucket S3.
- SMTP transaccional con dominio verificado.
- Dominio + TLS.
- Vault de secretos.
- Cron de backups programado.
- Sink de logs (CloudWatch/Datadog/Grafana Cloud).

**El proyecto está listo para prueba en staging.** Con la infraestructura anterior provisionada, está listo para producción.
