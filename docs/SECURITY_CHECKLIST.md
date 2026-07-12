# SECURITY CHECKLIST

Evolución de controles por etapa. Cada casilla exige evidencia verificable, no promesa.

## Desarrollo local (estado actual)

- [x] Password Argon2id, sesiones opacas httpOnly SameSite=Lax.
- [x] Guards server-side por plataforma/tenant/cliente/driver.
- [x] Origin/Host + content-type + tamaño verificados en endpoints mutables.
- [x] Rate limit persistente en login, sync, descargas.
- [x] CSP + nosniff + X-Frame + Referrer-Policy + Permissions-Policy + COOP/CORP.
- [x] SW no cachea rutas privadas ni MinIO.
- [x] Uploads validan MIME por magic bytes.
- [x] Signed URLs con TTL corto y content-disposition attachment.
- [x] Idempotencia persistente para acciones offline.
- [x] Logger con redacción; audit_logs no modificables desde UI.
- [x] `pnpm security:check` y `pnpm test:e2e` en verde.

## Antes de piloto externo

- [ ] Recuperación de contraseña con Mailpit/SMTP externo, tokens hasheados, un solo uso, expiración corta.
- [ ] Rotación de token de sesión post-login (defensa adicional contra fijación).
- [ ] "Cerrar todas las sesiones" desde la UI del usuario.
- [ ] Bloqueo temporal progresivo por usuario (además del rate limit por IP+email).
- [ ] Cola offline: fotografías como blobs con expiración y límites.
- [ ] Firma persistida en MinIO además de en DB.
- [ ] Escaneo AV local (ClamAV) con estado `PENDING_SCAN → CLEAN/REJECTED`.
- [ ] Pruebas de intrusión asistidas (checklist OWASP ASVS L1 pasado).

## Antes de nube

- [ ] TLS terminado, HSTS `max-age=31536000; includeSubDomains; preload`.
- [ ] Cookies `Secure` obligatorias.
- [ ] Bucket MinIO ⇒ S3 con políticas privadas por prefijo por tenant.
- [ ] Rate limit compartido (Redis) — el contrato `RateLimitProvider` ya existe.
- [ ] Rotación de credenciales de DB/MinIO por proyecto.
- [x] Backups cifrados (AES-256-GCM) con restauracion verificada y DR drill.
- [ ] Bitácora centralizada con retención.

## Producción

- [ ] Monitoreo de errores + alertas.
- [ ] SLO/SLA definidos.
- [ ] Playbook de incidentes ejecutado en simulacro.
- [ ] Revisión de dependencias mensual con `pnpm audit`.
- [ ] Auditoría externa antes de manejar volúmenes reales.

## Operación continua

- [ ] Revisión trimestral del threat model.
- [ ] Prueba anual de recuperación ante desastres.
- [ ] Actualización de ADRs cuando cambie el modelo.
- [ ] Rotación de secretos y personas con acceso.
