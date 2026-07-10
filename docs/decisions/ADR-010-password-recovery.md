# ADR-010: Recuperación segura de contraseña

Fecha: 2026-07-10
Estado: Aceptada

## Contexto

- La auditoría (VULN-003) confirmó que la tabla `password_reset_tokens` existía en el schema pero sin código consumidor.
- El proceso informal de restablecer contraseñas por soporte técnico es inseguro y no auditable.
- Se requiere flujo local completo con Mailpit, resistente a enumeración y a reuso de tokens.

## Decisiones

1. **Tabla existente reforzada** con `revoked_at` y `requested_ip_hash` (migración `20260710080000_session_metadata_and_reset_revocation`).
2. **Rutas dedicadas**:
   - `/recuperar` — solicita el token (form con correo).
   - `/recuperar/[token]` — valida y permite restablecer.
   - Ambas con `robots: noindex, nofollow` y `dynamic = "force-dynamic"`.
3. **Respuesta neutral**:
   - `requestPasswordReset(email, ip)` NO devuelve estado; siempre resuelve `undefined`.
   - Server action `requestResetAction` retorna `{ done: true }` sin importar el resultado.
   - Delay constante 300 ms en cliente.
4. **Token opaco 32 bytes → SHA-256** en DB. El token en claro solo viaja en el correo y por la URL del enlace.
5. **TTL 20 minutos** (`TOKEN_TTL_MINUTES = 20`).
6. **Un solo uso**: `usedAt` se marca dentro de la transacción de reset; una segunda llamada con el mismo token responde `USED`.
7. **Al generar un token nuevo se revocan tokens previos vigentes** del mismo usuario.
8. **Rate limit doble**:
   - Solicitud: 5/15min por correo + 20/15min por IP.
   - Consumo: 10/15min por IP (evita brute-force de tokens con adivinación).
9. **Correo profesional en español desde Mailpit**, con branding NCI Automation (no de tenant). El asunto es `Restablecer su contrasena`.
10. **Al reset exitoso**: `revokeAllUserSessions(userId, "password-reset")` invalida TODAS las sesiones del usuario, se audita, y el flujo redirige a `/login?password-reset=ok` (banner de éxito).
11. **Política de contraseñas**: mínimo 10, máximo 128 caracteres. Sin reglas arbitrarias adicionales. Compatible con gestores.
12. **Sin filtración de errores**: la UI muestra "El enlace ya no es valido" para cualquier fallo (invalid/expired/used/revoked); el detalle solo va a logs.
13. **`prune`**: `pruneStaleResetTokens()` se llama tras cada solicitud para no acumular tokens vencidos.

## Alternativas descartadas

- **Enviar la contraseña temporal por email**: sin uso de token con hash queda persistida en claro y susceptible a MITM del correo. Rechazado.
- **Preguntas de seguridad**: patrón inseguro; rechazado.
- **Magic link con auto-login sin restablecer**: no cierra sesiones existentes, no fuerza cambio de credencial. Rechazado para este caso.

## Consecuencias

- Nueva dependencia funcional en el transporte SMTP de Mailpit (ya existente en Docker local).
- Contraseñas anteriores permanecen válidas hasta que el usuario active el reset.
- La ruta `/recuperar/[token]` es pública y no debe ser cacheada por CDN o service worker; ya excluida por la política del SW y por `dynamic = force-dynamic`.
- Riesgo residual: intercepción del correo (Mailpit es local; en producción con SMTP externo la superficie cambia). Documentado.
