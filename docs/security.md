# Security

Controles implementados:

- Password hashing Argon2id.
- Sesiones opacas con token aleatorio y hash SHA-256 en base de datos.
- Cookie httpOnly, sameSite lax y secure en produccion.
- Validacion Zod en acciones principales.
- Autorizacion server-side por plataforma, tenant y cliente.
- Scope tenant/customer en queries operativas.
- Auditoria de login, tenants, solicitudes, viajes, incidencias y evidencias.

Pendiente:

- Rate limiting persistente.
- CSRF token dedicado adicional a SameSite.
- Recuperacion/cambio de password por Mailpit.
- Pruebas automatizadas de IDOR contra base real.
