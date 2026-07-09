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
- No usar Supabase, Vercel, Firebase ni servicios cloud para el flujo principal.
- No crear remotes ni hacer push.
- Registrar decisiones arquitectonicas en ADR.
- Ejecutar verificaciones reales y documentar resultados.
- No declarar que una prueba paso si no fue ejecutada.
- Actualizar `docs/CURRENT_STATE.md`, `docs/HANDOFF_LATEST.md`, `docs/SESSION_LOG.md` y `docs/VERIFICATION_LATEST.md` al cierre.

Al terminar una sesion, entregar un bloque `CHATGPT MEMORY UPDATE` con hechos verificados.
