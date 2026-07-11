# MFA SECURITY AUDIT

Fecha: 2026-07-11
Auditor: Claude Opus 4.6 (sesion MFA/2FA)
Alcance: autenticacion multifactor, proteccion de cuentas privilegiadas, reautenticacion sensible.

## Baseline verificado

| Verificacion | Resultado |
| --- | --- |
| `git status` | Working tree limpio, branch `main`, commit `071cb54` |
| `git remote -v` | Sin remotes |
| `docker compose ps` | PostgreSQL 5433, MinIO 9000/9001, Mailpit 1025/8025, ClamAV 3310 — todos healthy |
| `prisma migrate status` | 6 migraciones aplicadas, esquema al dia |
| `pnpm typecheck` | Sin errores |
| `pnpm lint` | 0 errores, 2 warnings (vars no usadas en test E2E) |
| `pnpm test` (Vitest) | 53/53 passed (11 archivos) |
| `pnpm test:e2e` (Playwright) | 46/46 passed |
| `pnpm security:check` | 25/25 verificaciones estaticas |
| `pnpm build` | Exitoso |
| `pnpm files:health` | ClamAV + PostgreSQL + MinIO OK |
| `pnpm files:test:eicar` | EICAR detectado correctamente |
| `pnpm audit --prod` | 2 advisories conocidas (effect via Prisma CLI, postcss via Next) — NOT_REACHABLE en runtime |

## Documentacion revisada

- AGENTS.md
- docs/PROJECT_MEMORY.md
- docs/CURRENT_STATE.md
- docs/HANDOFF_LATEST.md
- docs/VERIFICATION_LATEST.md
- docs/security.md
- docs/AUTHENTICATION_SECURITY.md
- docs/SESSION_MANAGEMENT.md
- docs/THREAT_MODEL.md
- docs/SECURITY_CHECKLIST.md
- docs/OFFLINE_SECURITY.md
- docs/decisions/ADR-009-session-rotation-and-revocation.md
- docs/decisions/ADR-010-password-recovery.md
- docs/decisions/ADR-015-pwa-update-strategy.md
- docs/decisions/ADR-016-offline-photo-sync.md
- docs/decisions/ADR-017-attachment-receipts.md

## Codigo fuente revisado

- `src/lib/server/auth.ts` — signIn, signOut, getSession, requireAuthenticatedUser, requirePlatformRole, requireTenantRole, requireTenantMembership, requireCustomerMembership, revokeAllUserSessions, revokeSessionById, revokeOtherSessions
- `src/lib/server/crypto.ts` — hashToken, createOpaqueToken, keyedHash, hashPassword, verifyPassword
- `src/lib/server/actions.ts` — loginAction, logoutAction, createTenantAction y todas las server actions
- `src/lib/server/session-management.ts` — SessionSummary, listUserSessions, summarizeUserAgent
- `prisma/schema.prisma` — modelo de datos completo (User, Session, PasswordResetToken, enums de roles)

---

## Hallazgos

### MFA-VULN-001 — Sin autenticacion multifactor [P0]

**Estado:** No implementado.
**Riesgo:** Critico.
**Descripcion:** El sistema no tiene ningun segundo factor de autenticacion. Una contrasena comprometida (phishing, reutilizacion, keylogger) otorga acceso total e inmediato a la cuenta, incluyendo cuentas con privilegios de plataforma (`PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`).

**Evidencia:**
- `src/lib/server/auth.ts:signIn()` verifica solo email+contrasena, retorna `{ ok: true }` sin paso adicional.
- `src/lib/server/actions.ts:loginAction()` redirige inmediatamente al dashboard tras `signIn` exitoso.
- No existe tabla ni campo para secretos TOTP en `prisma/schema.prisma`.
- `docs/AUTHENTICATION_SECURITY.md` linea 80: "Sin 2FA / MFA. Aceptado para el piloto; documentado como P2 futuro."
- ADR-009 linea 31: "2FA / MFA: fuera del alcance de esta fase. Aceptado como P2."

**Impacto:** Compromiso total de cuentas privilegiadas con solo una credencial. Sin segundo factor, las mitigaciones existentes (rate limit, delay, rotacion) no protegen contra credenciales filtradas.

**Remediacion requerida:**
1. Implementar TOTP (RFC 6238) con biblioteca mantenida (`otpauth`).
2. Secreto TOTP cifrado en reposo con AES-256-GCM usando `MFA_ENCRYPTION_KEY` del entorno.
3. QR code + ingreso manual del secreto durante setup.
4. Verificacion obligatoria de un codigo antes de activar MFA.
5. El secreto TOTP no debe mostrarse despues de completar la activacion.

### MFA-VULN-002 — Sin codigos de recuperacion [P0]

**Estado:** No implementado.
**Riesgo:** Critico.
**Descripcion:** Sin codigos de respaldo, un usuario que pierde acceso a su dispositivo TOTP queda bloqueado permanentemente. No hay mecanismo de recuperacion de cuenta alternativo al dispositivo.

**Remediacion requerida:**
1. Generar 8-12 codigos de alta entropia al activar MFA.
2. Almacenar solo los hashes (SHA-256) — nunca texto plano.
3. Cada codigo es de un solo uso: marcar `used_at` al consumir.
4. Mostrar codigos una sola vez al usuario tras generarlos.
5. Permitir regeneracion con reautenticacion (contrasena + TOTP valido).
6. Mostrar conteo de codigos restantes en la UI de seguridad.

### MFA-VULN-003 — Sin modelo de sesion parcial [P0]

**Estado:** No implementado.
**Riesgo:** Critico.
**Descripcion:** El modelo de sesion (`sessions`) no distingue entre autenticacion completa y parcial. Una vez verificada la contrasena, `getSession()` retorna la sesion completa con acceso total. No hay concepto de "pendiente de MFA" que impida acceder a rutas protegidas antes de completar el segundo factor.

**Evidencia:**
- `prisma/schema.prisma` modelo `Session`: no tiene campo `authLevel` ni equivalente.
- `src/lib/server/auth.ts:getSession()` linea 124-153: valida solo `revokedAt`, `expiresAt` y `user.active`. Si pasan, la sesion es valida sin restriccion.
- `src/lib/server/auth.ts:requireAuthenticatedUser()` linea 156-159: redirige a `/login` si no hay sesion, pero no verifica nivel de autenticacion.

**Impacto:** Sin sesiones parciales, no es posible implementar un flujo de login con MFA donde el segundo factor sea obligatorio antes de acceder a recursos protegidos.

**Remediacion requerida:**
1. Agregar campo `auth_level` al modelo `Session` con valores: `PASSWORD_ONLY`, `MFA_VERIFIED`, `PARTIAL_MFA_PENDING`.
2. Modificar `getSession()` para incluir `authLevel` en el objeto retornado.
3. Modificar `requireAuthenticatedUser()` y guards derivados para rechazar sesiones `PARTIAL_MFA_PENDING`.
4. Crear ruta `/mfa/verify` como unica ruta accesible con sesion parcial.
5. `signIn()` debe crear sesiones con `authLevel = PARTIAL_MFA_PENDING` cuando el usuario tiene MFA activo.

### MFA-VULN-004 — Sin enforcement de MFA para roles privilegiados [P1]

**Estado:** No implementado.
**Riesgo:** Alto.
**Descripcion:** Los roles `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`, `TENANT_OWNER` y `TENANT_ADMIN` acceden a funciones criticas (crear tenants, modo soporte, gestionar usuarios, configuracion) sin ningun requisito de segundo factor. La politica de seguridad deberia exigir MFA para estos roles.

**Evidencia:**
- `src/lib/server/auth.ts:requirePlatformRole()` linea 167-170: verifica solo `user.platformRole`, no MFA.
- `src/lib/server/auth.ts:requireTenantRole()` linea 197-200: verifica solo `membership.role`, no MFA.
- `docs/PROJECT_MEMORY.md`: define los 4 roles privilegiados sin politica de MFA.

**Remediacion requerida:**
1. Definir lista de roles que requieren MFA obligatorio.
2. Redirigir a setup de MFA si el rol lo exige y el usuario no lo tiene configurado.
3. No permitir acceso a rutas privilegiadas sin MFA verificado en la sesion.
4. El enforcement se aplica en server-side, no en el frontend.

### MFA-VULN-005 — Sin reautenticacion para acciones sensibles [P1]

**Estado:** No implementado.
**Riesgo:** Alto.
**Descripcion:** Acciones criticas como cambiar contrasena, revocar sesiones, desactivar MFA y gestionar tenants no requieren reconfirmacion reciente de identidad. Un atacante con una sesion activa (cookie robada, dispositivo desatendido) puede realizar cambios irreversibles.

**Evidencia:**
- `src/lib/server/actions.ts`: ninguna server action verifica tiempo desde ultima autenticacion.
- Acciones de sesion (`revokeSessionAction`, `revokeAllSessionsAction`) en la UI: ejecutan sin reauth.
- No existe concepto de "ventana de reautenticacion" en el codigo.

**Remediacion requerida:**
1. Implementar `requireRecentAuth(sessionId, windowMinutes)` que verifique si la ultima autenticacion fuerte (contrasena o MFA) fue reciente (10-15 minutos).
2. Tabla `mfa_challenges` con `purpose`, `completed_at`, `expires_at` para tracking.
3. Aplicar a: cambio de contrasena, desactivar MFA, regenerar codigos de recuperacion, revocar todas las sesiones, operaciones de plataforma criticas.

### MFA-VULN-006 — Sin rate limiting especifico para verificacion MFA [P1]

**Estado:** No implementado.
**Riesgo:** Alto.
**Descripcion:** Aunque existe infraestructura de rate limiting (`RateLimitBucket`), no hay limites especificos para intentos de verificacion TOTP. Un TOTP de 6 digitos tiene solo 1M combinaciones; sin rate limiting estricto, un ataque de fuerza bruta podria comprometer el segundo factor.

**Evidencia:**
- `prisma/schema.prisma` modelo `RateLimitBucket`: la infraestructura existe y esta probada.
- `src/lib/server/rate-limit.ts`: soporta scope/key/limit/windowSeconds — reutilizable.

**Remediacion requerida:**
1. Maximo 5 intentos por challenge individual.
2. Maximo 10 intentos por usuario en ventana de 15 minutos.
3. Maximo 30 intentos por IP en ventana de 15 minutos.
4. Tras agotar intentos de challenge: invalidar el challenge, forzar nuevo login.
5. Registrar intentos fallidos en audit_logs.

### MFA-VULN-007 — Sin dashboard de seguridad de cuenta [P2]

**Estado:** No implementado.
**Riesgo:** Medio.
**Descripcion:** No existe una pagina centralizada donde el usuario vea el estado de seguridad de su cuenta: MFA activo/inactivo, codigos de recuperacion restantes, sesiones activas, ultimo cambio de contrasena.

**Evidencia:**
- `/account/sessions` existe pero solo muestra sesiones.
- No hay ruta `/account/security` ni similar.

**Remediacion requerida:**
1. Pagina `/account/security` como hub de seguridad.
2. Secciones: estado MFA, codigos de recuperacion, enlace a sesiones, ultimo cambio de contrasena.
3. Acciones: activar/desactivar MFA, regenerar codigos, cambiar contrasena.
4. Toda la interfaz en espanol.

### MFA-VULN-008 — signIn no soporta flujo bifurcado [P2]

**Estado:** No implementado.
**Riesgo:** Medio.
**Descripcion:** `signIn()` retorna `{ ok: true }` o `{ ok: false, message }`. No hay forma de indicar "contrasena correcta, pero se requiere MFA" para bifurcar el flujo de login.

**Evidencia:**
- `src/lib/server/auth.ts:signIn()` linea 37-97: crea sesion y retorna ok sin campo adicional.
- `src/lib/server/actions.ts:loginAction()` linea 37-85: tras signIn exitoso, redirige inmediatamente.

**Remediacion requerida:**
1. `signIn()` debe retornar `{ ok: true, mfaRequired: false }` o `{ ok: true, mfaRequired: true }`.
2. Cuando `mfaRequired: true`, la sesion se crea como `PARTIAL_MFA_PENDING`.
3. `loginAction()` redirige a `/mfa/verify` en lugar del dashboard.
4. La verificacion MFA exitosa promueve `authLevel` a `MFA_VERIFIED`.

---

## Analisis de infraestructura existente reutilizable

### Fortalezas que facilitan la implementacion

| Componente | Ubicacion | Reutilizable para MFA |
| --- | --- | --- |
| `hashToken(token)` SHA-256 | `crypto.ts:4` | Hash de codigos de recuperacion |
| `createOpaqueToken()` 32 bytes | `crypto.ts:8` | Generacion de challenges |
| `keyedHash(value, purpose)` HMAC | `crypto.ts:17` | Derivacion de claves con proposito |
| `RateLimitBucket` + `enforceRateLimit()` | `rate-limit.ts` | Rate limiting de verificacion TOTP |
| `audit()` | `audit.ts` | Auditoria de eventos MFA |
| `revokeAllUserSessions()` | `auth.ts:244` | Revocacion al desactivar MFA |
| `SessionSummary` | `session-management.ts` | Extension con info MFA |
| Cookie httpOnly + session opaca | `auth.ts:88-94` | Misma cookie para sesiones parciales |
| Zod + server actions | Todo el proyecto | Validacion de formularios MFA |

### Cambios de esquema necesarios

```
model UserMfaSecret {
  id              UUID PK
  userId          UUID FK UNIQUE → users.id
  encryptedSecret String    -- AES-256-GCM con MFA_ENCRYPTION_KEY
  iv              String    -- vector de inicializacion
  authTag         String    -- tag de autenticacion GCM
  algorithm       String    -- "SHA-1" (estandar TOTP)
  digits          Int       -- 6
  period          Int       -- 30
  verified        Boolean   -- false hasta primer codigo valido
  createdAt       DateTime
  verifiedAt      DateTime?
}

model MfaRecoveryCode {
  id        UUID PK
  userId    UUID FK → users.id
  codeHash  String    -- SHA-256 del codigo
  usedAt    DateTime?
  createdAt DateTime
  @@unique([userId, codeHash])
}

model MfaChallenge {
  id          UUID PK
  userId      UUID FK → users.id
  sessionId   UUID FK → sessions.id
  purpose     String    -- "login" | "reauth" | "disable_mfa" | "regenerate_codes"
  expiresAt   DateTime  -- TTL 5 minutos
  attempts    Int       -- contador, max 5
  maxAttempts Int       -- 5
  completedAt DateTime?
  createdAt   DateTime
}

-- Modificacion a Session existente:
Session.authLevel  String  -- "PASSWORD_ONLY" | "MFA_VERIFIED" | "PARTIAL_MFA_PENDING"
```

### Variables de entorno nuevas

| Variable | Proposito | Ejemplo |
| --- | --- | --- |
| `MFA_ENCRYPTION_KEY` | Cifrar/descifrar secretos TOTP (AES-256, 32 bytes hex) | `openssl rand -hex 32` |

### Rutas nuevas necesarias

| Ruta | Tipo | Proposito |
| --- | --- | --- |
| `/mfa/verify` | Page | Verificacion TOTP tras login (sesion parcial) |
| `/account/security` | Page | Dashboard de seguridad |
| `/account/security/mfa/setup` | Page | Configuracion de MFA (QR + verificacion) |

---

## Riesgos residuales post-implementacion (anticipados)

1. **Dispositivo TOTP perdido sin codigos de recuperacion**: mitigado con instrucciones claras al generar codigos y conteo visible de restantes.
2. **Clock skew TOTP**: la mayoria de bibliotecas aceptan ventana de +-1 periodo (30s). Documentar requisito de hora sincronizada.
3. **MFA_ENCRYPTION_KEY comprometida**: expone todos los secretos TOTP. Mitigacion: rotacion de clave con re-cifrado, almacenamiento seguro del secreto.
4. **Sesion parcial que nunca completa MFA**: la sesion expira normalmente a los 7 dias; considerar TTL mas corto para sesiones parciales (15 minutos).

## Resumen de prioridades

| ID | Prioridad | Hallazgo | Estado |
| --- | --- | --- | --- |
| MFA-VULN-001 | P0 | Sin autenticacion multifactor | Pendiente |
| MFA-VULN-002 | P0 | Sin codigos de recuperacion | Pendiente |
| MFA-VULN-003 | P0 | Sin modelo de sesion parcial | Pendiente |
| MFA-VULN-004 | P1 | Sin enforcement para roles privilegiados | Pendiente |
| MFA-VULN-005 | P1 | Sin reautenticacion para acciones sensibles | Pendiente |
| MFA-VULN-006 | P1 | Sin rate limiting para verificacion MFA | Pendiente |
| MFA-VULN-007 | P2 | Sin dashboard de seguridad de cuenta | Pendiente |
| MFA-VULN-008 | P2 | signIn no soporta flujo bifurcado | Pendiente |

## Plan de remediacion (orden de implementacion)

1. **Migracion Prisma**: tablas `user_mfa_secrets`, `mfa_recovery_codes`, `mfa_challenges`; campo `auth_level` en `sessions`.
2. **TOTP core**: cifrado/descifrado de secretos, generacion QR, verificacion con ventana.
3. **Recovery codes**: generacion, hash, verificacion, regeneracion.
4. **Sesion parcial**: `authLevel` en signIn/getSession, guards, ruta `/mfa/verify`.
5. **Setup MFA**: ruta `/account/security/mfa/setup`, flujo QR + verificacion + codigos.
6. **Login con MFA**: bifurcacion en loginAction, redirect a `/mfa/verify`.
7. **Enforcement por rol**: redirect forzado a setup si rol requiere MFA.
8. **Reautenticacion sensible**: `requireRecentAuth()`, MFA challenge con proposito.
9. **Dashboard seguridad**: `/account/security` con estado completo.
10. **Rate limiting MFA**: limites por challenge, usuario e IP.
11. **Tests**: unit para TOTP/recovery/challenges, E2E para flujos completos, security tests.
12. **Documentacion**: ADR-018 (MFA TOTP), ADR-019 (enforcement y reauth), actualizacion de docs existentes.
