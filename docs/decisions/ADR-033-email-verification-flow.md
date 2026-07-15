# ADR-033: Flujo de verificación de correo con enlace opaco y plantilla profesional

Estado: Aceptado
Fecha: 2026-07-15

## Contexto

Antes de este cambio, la plataforma creaba cuentas de owner de tenant y usuarios internos con `emailVerified: false` pero sin enviar ningún correo automático. El usuario recibía las credenciales por otro canal manual, lo cual:

- Rompe la garantía de que el correo pertenece al destinatario real.
- Impide activar MFA con confianza (no hay un canal verificado para recuperación).
- Genera fricción operativa: el admin del tenant o de la plataforma tiene que copiar y pegar credenciales manualmente.
- No cumple prácticas mínimas de seguridad para SaaS multitenant.

El requisito de negocio: **al crear un tenant o un usuario dentro del tenant, el sistema debe enviar automáticamente un correo profesional con enlace de verificación y las instrucciones para configurar MFA**, en un flujo 100% automatizado.

## Decisión

Se implementa un flujo de verificación de correo con:

1. **Token opaco de 32 bytes** (`createOpaqueToken()`) persistido en el modelo `User` en dos columnas nuevas:
   - `emailVerifyToken` (String, único, opcional)
   - `emailVerifyTokenExpiresAt` (DateTime, opcional)
2. **TTL de 48 horas** desde la creación del token.
3. **Página server-rendered** en `/verificar-email/[token]` que consume el token y actualiza `emailVerified = true`.
4. **Plantilla HTML profesional** con inline CSS y branding NCI Logistics Control Tower, servida por `email-templates.ts`.
5. **Envío automático de dos flujos**:
   - **Tenant creation** (`createTenantFullAction`): welcome al owner con verificación, contraseña temporal e instrucciones de MFA.
   - **Tenant user creation** (`createTenantUserAction`): welcome al nuevo miembro con verificación, contraseña temporal, invitado por, rol.
   - **Invitación** (`createInvitation`): plantilla profesional consistente.
6. **Idempotencia del token**: `verifyEmailToken()` NO borra el token al éxito. Marca `emailVerified = true` y devuelve `ok`. Si se llama de nuevo con el mismo token, verifica `emailVerified` y devuelve `ok` sin más side effects.

### Justificación de la idempotencia

Next.js con React Strict Mode en desarrollo doble-renderiza los Server Components. Si `verifyEmailToken()` borrara el token en la primera invocación, la segunda no encontraría al usuario y mostraría "enlace inválido o ya utilizado", generando un falso negativo visible al usuario.

Con la implementación idempotente:
- Primera invocación: encuentra al usuario, marca `emailVerified = true`, devuelve `ok`.
- Segunda invocación (double-render o refresh): encuentra al usuario por token, detecta `emailVerified = true`, devuelve `ok` sin escribir de nuevo.
- Token expira naturalmente a las 48 horas (limpieza automática si se desea con job programado).

El token nunca se puede usar como bypass posterior: solo confirma el estado ya alcanzado.

## Alternativas consideradas

- **JWT firmado en lugar de token opaco**: rechazado por incrementar la superficie de ataque (revocación imposible sin lista negra) y ser innecesario cuando ya hay una base de datos.
- **Borrar token al éxito**: fallaba en dev por Strict Mode double-render (documentado arriba). En producción sería seguro, pero mantener idempotencia es más resiliente y elimina modos de fallo.
- **Endpoint POST en lugar de página GET**: rechazado por UX. El usuario espera un enlace clickeable directo, no un formulario intermedio.

## Consecuencias

**Positivas:**
- Alta automática de tenants ahora incluye canal verificado para MFA y recuperación de contraseña.
- Nuevos usuarios de tenant reciben instrucciones consistentes sin intervención manual del admin.
- Plantillas HTML consistentes en branding con encabezado NCI, botón CTA, aviso de expiración.
- Flujo probado end-to-end con Playwright y verificado manualmente en dev.

**Negativas:**
- Añade una dependencia dura de SMTP funcional. Documentado en [`DEPLOYMENT.md`](../DEPLOYMENT.md) con opciones (SES, SendGrid, etc.).
- El campo `emailVerifyToken` queda persistido hasta expirar. Aceptable — es un token de un solo uso lógico (solo confirma un estado idempotente).

**Riesgos residuales:**
- Si el proveedor SMTP falla en tiempo de creación, la cuenta se crea pero el email no se envía. Mitigación: los emails de recuperación de contraseña siguen funcionando; el admin puede regenerar el token desde `platform`.
- Enumeración de emails: la respuesta de la página `/verificar-email/[token]` es consistente (mensaje genérico para tokens inválidos), previniendo enumeración.

## Referencias

- Migration: `prisma/migrations/20260715060000_add_email_verification_fields/`
- Código: `src/lib/server/email-verification.ts`, `src/lib/server/email-templates.ts`, `src/app/verificar-email/[token]/page.tsx`
- Actions afectadas: `src/lib/server/tenant-actions.ts`, `src/lib/server/tenant-user-actions.ts`, `src/lib/server/invitation-actions.ts`
- ADR relacionado: [ADR-025](ADR-025-platform-tenant-administration-model.md) (modelo de administración de tenants)
