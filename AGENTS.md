# AGENTS.md

Todo agente que trabaje en este repositorio debe empezar leyendo:

1. `docs/PROJECT_MEMORY.md`
2. `docs/CURRENT_STATE.md`
3. `docs/HANDOFF_LATEST.md`
4. `docs/VERIFICATION_LATEST.md`
5. ADRs en `docs/decisions/`

Reglas no negociables:

- No romper aislamiento multitenant.
- No usar `tenant_id` del navegador para autorizar operaciones.
- Resolver tenant desde ruta, sesion y membresia verificada en servidor.
- No hardcodear Panatruck en componentes reutilizables.
- No crear integraciones reales sin aprobacion.
- El flujo principal local sigue sin servicios cloud (ADR-002). Excepcion autorizada por el
  dueno el 2026-11-12: entorno de **staging** en GitHub (repo publico), Supabase, Vercel y
  ClamAV en Fly.io segun ADR-036. Produccion real y cualquier costo nuevo requieren
  aprobacion explicita. Firebase u otros servicios siguen fuera.
- Push solo al remote `origin` documentado en ADR-036. El repo es publico: nunca commitear
  secretos; credenciales demo solo validas con `APP_ENV=local`.
- Registrar decisiones arquitectonicas en ADR.
- Ejecutar verificaciones reales y documentar resultados.
- No declarar que una prueba paso si no fue ejecutada.
- Actualizar `docs/CURRENT_STATE.md`, `docs/HANDOFF_LATEST.md`, `docs/SESSION_LOG.md` y `docs/VERIFICATION_LATEST.md` al cierre.

Al terminar una sesion, entregar un bloque `CHATGPT MEMORY UPDATE` con hechos verificados.
