# ADR-018: Autenticación multifactor con TOTP

Fecha: 2026-07-11
Estado: Aceptada

## Contexto

- La auditoría MFA_SECURITY_AUDIT.md identificó 8 hallazgos (MFA-VULN-001 a 008): sin MFA, sin códigos de recuperación, sin sesiones parciales, sin enforcement por rol.
- Los roles privilegiados (PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT, TENANT_OWNER, TENANT_ADMIN) operan sin segundo factor, exponiendo funciones críticas a compromiso de contraseña.
- OWASP ASVS 2.8 requiere MFA verificable para accesos administrativos.

## Decisiones

1. **TOTP (RFC 6238)** con `otpauth` v9.5.1. SHA1, 6 dígitos, período de 30s, ventana ±1. Compatible con Google Authenticator, Authy, 1Password.
2. **Secreto TOTP cifrado en reposo** con AES-256-GCM. La clave de cifrado (`MFA_ENCRYPTION_KEY`) es un hex de 64 chars en variable de entorno. Cada registro almacena IV y authTag por separado.
3. **Modelo de datos**: tabla `user_mfa_secrets` con campos `encrypted_secret`, `iv`, `auth_tag`, `verified`, `verified_at`. Relación 1:1 con User. Un secreto no verificado se reemplaza al reiniciar setup.
4. **Activación en dos pasos**: `setupMfaSecret` genera y persiste el secreto (no verificado), retorna URI para QR + secreto para entrada manual. `verifyAndActivateMfa` valida el código TOTP del usuario y marca `verified = true`.
5. **10 códigos de recuperación** de 20 caracteres hex con formato `xxxxx-xxxxx-xxxxx-xxxxx`. Almacenados como SHA-256 hash. Cada código es de un solo uso (`usedAt` timestamp). Se generan al activar MFA y pueden regenerarse requiriendo password + TOTP.
6. **Sesiones parciales**: cuando un usuario con MFA activo hace login con contraseña, la sesión se crea con `authLevel = PARTIAL_MFA_PENDING` y TTL de 15 minutos. `requireAuthenticatedUser()` redirige estas sesiones a `/mfa/verify`. Tras verificación exitosa, `promoteSessionToMfaVerified()` cambia a `MFA_VERIFIED` con TTL de 7 días.
7. **Rate limiting**: 10 intentos de verificación MFA por usuario cada 15 minutos. Usa la misma infraestructura de `enforceRateLimit`.
8. **Enforcement por rol**: `requirePlatformRole()` y `requireTenantRole()` verifican si el rol requiere MFA; si el usuario no tiene MFA activado, redirigen a `/account/security/mfa/setup`. Login action aplica la misma lógica.
9. **Desactivación segura**: requiere tanto contraseña como código TOTP válido. Elimina secreto, códigos de recuperación y challenges en una transacción.
10. **Regeneración de códigos**: requiere contraseña + TOTP. Elimina todos los códigos anteriores y genera 10 nuevos en transacción.
11. **Challenges MFA**: tabla `mfa_challenges` para reautenticación de acciones sensibles. TTL de 5 minutos, máximo 5 intentos, propósito etiquetado (login, reauth).
12. **QR SVG server-side**: generado con `qrcode` v1.5.4 (tipo SVG). Renderizado con `dangerouslySetInnerHTML` acotado al componente `mfa-setup-flow.tsx` (SVG controlado, sin input de usuario).
13. **Auditoría completa**: todos los eventos MFA se registran vía `audit()`: activación, desactivación, login verificado, código incorrecto, recuperación usada, regeneración.

## Alternativas descartadas

- **WebAuthn/FIDO2**: mayor seguridad pero requiere soporte de hardware/navegador y complejidad de registro significativamente mayor. Candidato para fase futura (MFA-VULN-008 en backlog).
- **SMS OTP**: dependencia de proveedor externo, vulnerable a SIM swap, costo por mensaje. Rechazado.
- **Email OTP**: ya disponible como canal para password reset; usar el mismo canal para MFA reduce el valor del segundo factor. Rechazado como factor primario.
- **Secretos TOTP en texto plano**: violación directa de las reglas de seguridad del spec. Rechazado.

## Consecuencias

- Nueva dependencia: `otpauth` v9.5.1 (TOTP), `qrcode` v1.5.4 (QR SVG).
- Variable de entorno requerida: `MFA_ENCRYPTION_KEY` (32 bytes hex). Documentada en `.env.example`.
- La migración `20260711073243_mfa_totp_and_recovery` agrega campo `auth_level` a sessions y crea 3 tablas nuevas.
- Usuarios con roles privilegiados serán forzados a configurar MFA en su próximo acceso a funciones protegidas.
- El flujo de login se bifurca: contraseña sola vs contraseña + MFA verify page.
- Riesgo residual: pérdida de dispositivo autenticador + códigos de recuperación agotados requiere intervención manual de soporte. Documentado en backlog.
