# SECURITY REMEDIATION PLAN

Fecha: 2026-07-10
Base: [CLAUDE_SECURITY_AUDIT.md](CLAUDE_SECURITY_AUDIT.md), commit `0141575`.

## Clasificación

| ID | Título | Severidad | Prioridad | Estado |
|---|---|---|---|---|
| VULN-001 | Race condition en receipts offline (doble evento) | alta | **P0** | Se remedia en esta fase |
| VULN-002 | Login no invalida sesión previa del mismo navegador | alta | **P1** | Se remedia en esta fase |
| VULN-003 | Sin flujo de recuperación de contraseña | media | **P1** | Se remedia en esta fase |
| VULN-004 | Cambio/reset de contraseña no invalida sesiones | alta | **P1** | Se remedia junto con VULN-003 |
| VULN-005 | Sin gestión de sesiones activas | media | **P1** | Se remedia en esta fase |
| VULN-006 | X-Forwarded-For sin sanitizar en despliegue tras proxy | media | **P2** | Documentar; ajustar en despliegue |
| VULN-007 | `currentServerState` filtra estado en `ASSIGNMENT_CHANGED` | baja | **P2** | Se remedia en esta fase (bajo costo) |
| VULN-008 | IndexedDB residual tras cambio de usuario en dispositivo compartido | baja | **P2** | Documentado como riesgo residual |
| VULN-DEP-001 | `fast-xml-parser` (7 advisories) vía AWS SDK | crítica + altas | **P1** | Se remedia con `@aws-sdk/client-s3@latest` |
| VULN-DEP-002 | `effect@3.18.4` vía `@prisma/config` (CLI) | alta | **NO ALCANZABLE** | Documentar en `DEPENDENCY_REACHABILITY.md` |
| VULN-DEP-003 | `postcss@8.4.31` vía Next+geist (build) | moderada | **NO ALCANZABLE** | Documentar en `DEPENDENCY_REACHABILITY.md` |

## Plan de ejecución

### Bloque A — Correcciones inmediatas (P0)

1. **VULN-001**: reescribir `processTransition` / `processIncident` para que el receipt se cree como PRIMER paso de la transacción (`create` en vez de `upsert`), forzando el UNIQUE a fallar antes del `trip.update` o `incident.create`. Prueba unitaria: dos ejecuciones simultáneas del mismo comando resuelven con exactamente un `tripEvent`.

### Bloque B — Autenticación y sesiones (P1)

2. Migración nueva que agrega `Session.userAgent`, `Session.ipHash`, `PasswordResetToken.revokedAt`, `PasswordResetToken.requestedIpHash`.
3. **VULN-002**: en `signIn`, si la request trae cookie con token válido, revocar esa sesión previa (mismo navegador) antes de crear la nueva. Almacenar `userAgent` truncado y `ipHash` en la nueva sesión.
4. **VULN-004 + VULN-003**: helper `revokeAllUserSessions(userId)` invocable desde:
   - Reset de contraseña.
   - Acción de "cerrar todas las sesiones".
5. **VULN-003 (recuperación)**:
   - Rutas `/recuperar` (solicitud) y `/recuperar/[token]` (reset).
   - Respuesta idéntica exista o no el correo, con delay constante.
   - Rate limit por email y por IP.
   - Token 32 bytes random → SHA-256 → tabla `password_reset_tokens`.
   - TTL 20 min, un solo uso, `revokedAt` al usar.
   - Correo profesional en español desde Mailpit (branding NCI genérico, no de tenant).
   - Al cambiar la contraseña: `hashPassword` (Argon2id), `revokeAllUserSessions`, audit_log.
6. **VULN-005 (sesiones activas)**:
   - Página `/account/sessions` con lista de sesiones del usuario autenticado.
   - Muestra User-Agent resumido, fecha creación, último uso, IP parcial (primeros 2 octetos + `.xxx.xxx`), sesión actual marcada.
   - Acciones: cerrar una, cerrar todas las demás, cerrar todas.
   - Server actions con confirmación.
   - Enlace desde el shell (icono en topbar del tenant/portal).

### Bloque C — Dependencias

7. **VULN-DEP-001**: actualizar `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` a versión que use `@aws-sdk/xml-builder` sin `fast-xml-parser`. Verificar con `pnpm audit --prod` post-actualización. Cero cambios de código esperados (API estable).
8. **VULN-DEP-002 y VULN-DEP-003**: documentar en `docs/DEPENDENCY_REACHABILITY.md` con cadena, condición de reachability y fecha de próxima revisión.

### Bloque D — Correcciones menores

9. **VULN-007**: no incluir `currentServerState` cuando el resultado es `ASSIGNMENT_CHANGED`.
10. **VULN-006**: agregar a `DEPENDENCY_REACHABILITY.md` sección "IP behind proxy" con guía.

### Bloque E — Pruebas y observabilidad

11. Pruebas unit nuevas: race en receipts (T-01), token de recuperación (T-02), delay constante (T-03).
12. Pruebas E2E nuevas: rotación de sesión post-login (E-01), recuperación completa (E-02), gestión de sesiones activas (E-03), no filtración cross-user en sesiones (E-04), cambio de contraseña invalida sesiones (E-05).
13. Extender `security:check`: verificar existencia de `revokeAllUserSessions`, tokens de recuperación siempre hasheados (grep `password_reset_tokens.*token` sin `Hash`), rutas de recuperación con rate limit visible.

### Bloque F — Documentación

14. Crear `AUTHENTICATION_SECURITY.md`, `SESSION_MANAGEMENT.md`, `DEPENDENCY_REACHABILITY.md`.
15. ADR-009 (rotación y revocación de sesiones), ADR-010 (recuperación de contraseña).
16. Actualizar `security.md`, `THREAT_MODEL.md`, `SECURITY_HARDENING.md`, `SECURITY_CHECKLIST.md`, `INCIDENT_RESPONSE.md`, `CURRENT_STATE.md`, `HANDOFF_LATEST.md`, `SESSION_LOG.md`, `VERIFICATION_LATEST.md`.
17. Handoff fechado en `docs/session-handoffs/`.

## Fuera de alcance de esta fase (aceptado)

- ClamAV / escaneo AV real.
- Fotografías offline con blobs.
- Rotación proactiva de cookies cada N minutos.
- 2FA / MFA.
- Bloqueo temporal progresivo por usuario (además del rate limit).
- HSTS / TLS local.

## Criterios de aceptación

- `pnpm verify` en verde.
- `pnpm test:e2e` en verde (los 19 previos + los nuevos).
- `pnpm security:check` en verde con las nuevas comprobaciones.
- `pnpm audit --prod`: sin críticas alcanzables abiertas (2 no alcanzables documentadas quedan como "aceptado con seguimiento").
- Working tree limpio, sin remote, sin push.
- Handoff completo con `CHATGPT MEMORY UPDATE`.
