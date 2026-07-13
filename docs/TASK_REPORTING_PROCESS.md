# Proceso de Informes de Tarea

## Proposito

Cada tarea completada genera un informe estructurado en `docs/task-reports/` que documenta que se hizo, que se verifico y que evidencia existe. Esto permite auditar el trabajo realizado sin depender de la memoria de quien lo hizo.

## Ubicacion

```
docs/task-reports/
├── TEMPLATE.md
└── YYYYMMDD-HHMM-descripcion-corta.md
```

## Formato del nombre

`YYYYMMDD-HHMM-descripcion-en-kebab-case.md`

Ejemplo: `20260712-2130-platform-tenant-admin-and-connectors.md`

## Plantilla

Cada informe sigue la plantilla en `docs/task-reports/TEMPLATE.md` con las siguientes secciones:

1. **Objetivo**: Que se intento lograr
2. **Cambios realizados**: Archivos creados, modificados, eliminados
3. **Modelos de datos**: Cambios en Prisma schema y migraciones
4. **Verificaciones ejecutadas**: Comandos ejecutados y resultados
5. **Evidencia**: Resultados de typecheck, lint, test, build, e2e, security
6. **Riesgos y limitaciones**: Problemas conocidos o pendientes
7. **Siguiente paso**: Que hacer despues

## Cuando crear un informe

- Al completar una tarea significativa (fase, batch de implementacion)
- Al completar una auditoria de seguridad
- Al completar una migracion de base de datos
- Al resolver un incidente o bug critico

## Quien lo usa

- El dueno del software para verificar progreso
- Futuros desarrolladores para entender el historial
- Auditorias de seguridad para evidencia de verificacion
