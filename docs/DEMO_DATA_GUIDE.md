# Demo Data Guide

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `pnpm demo:seed` | Genera datos demo extendidos (horarios, estimaciones, recomendaciones, feedback) |
| `pnpm demo:reset` | Elimina datos demo extendidos (preserva tenants y viajes base) |
| `pnpm demo:status` | Muestra conteos de datos por tenant demo |

## Prerequisitos

Ejecutar primero el seed base:

```bash
pnpm db:seed
```

Esto crea los tenants demo (Panatruck Demo, TransLogistica Demo), usuarios, conductores, vehiculos y viajes.

## demo:seed

Genera sobre los datos base:

- **Horarios laborales**: 5 dias/semana (Lun-Vie, 06:00-18:00) para cada conductor
- **Estimaciones de ruta**: SIMULATED para viajes activos
- **Recomendaciones de conductor**: 3 candidatos por viaje con scores (90/75/60)
- **Feedback**: 6 entries con tipos variados (BUG, FEATURE_REQUEST, UX, etc.)
- **AI settings**: habilita IA para tenants demo

Es idempotente: si los datos ya existen, los omite.

## demo:reset

Elimina datos creados por `demo:seed`:
- AI invocations y usage daily
- Recomendaciones de conductor
- Estimaciones de ruta
- Horarios laborales
- Alertas operativas
- Feedback
- AI settings

No toca: tenants, usuarios, conductores, vehiculos, viajes, incidentes, PODs.

## demo:status

Muestra un resumen por tenant demo:

```
=== Panatruck Demo (panatruck-demo) ===
  Usuarios:          4
  Conductores:       5
  Vehiculos:         5
  Clientes:          3
  Viajes:            10
  Horarios:          25
  Estimaciones ruta: 5
  Recomendaciones:   15
  ...
```

## Credenciales demo

Documentadas en `prisma/seed.ts`:

| Email | Password | Rol |
|-------|----------|-----|
| platform@nci.local | NCIPlatform2026! | Platform Super Admin |
| owner@panatruck.local | PanatruckOwner2026! | Tenant Owner |
| operaciones@panatruck.local | Operaciones2026! | Operations Manager |
| despacho@panatruck.local | Despacho2026! | Dispatcher |
| conductor1@panatruck.local | Conductor2026! | Driver |
