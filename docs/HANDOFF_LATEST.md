# HANDOFF LATEST

Fecha: 2026-11-12
Agente: Claude Opus 5.5 (auditoría + remediación P0 del núcleo operativo)

## Qué se hizo

1. **Auditoría de solo lectura del proyecto.** Encontró hallazgos P0, P1 y P2:
   - P0: flujo de viajes sin cancelación ni excepciones, `return;` silenciosos y carreras
     de concurrencia;
   - P1: sin RLS ni claves foráneas compuestas, cumplimiento enlazado por texto, estado de
     activos en texto libre, finanzas sin moneda, roles incoherentes;
   - P2: `actions.ts` monolítico, sin tests de integración con DB, crecimiento de alcance,
     documentación desincronizada.
2. **Remediación P0 (ADR-035).** Ver `docs/decisions/ADR-035-…` y `CURRENT_STATE.md`.

## Archivos clave nuevos

- `src/lib/domain/request-state-machine.ts` (+ test)
- `src/lib/server/request-actions.ts`: convertir, revisar (pedir información o rechazar) y
  acciones del cliente
- `src/lib/server/action-result.ts`, `src/components/ui/action-form.tsx`
- `prisma/migrations/20261112120000_trip_exceptions_and_request_reasons/` (aditiva)
- `tests/e2e/trip-exceptions.spec.ts`

## Contratos nuevos

- Las server actions de viaje, solicitud y evidencia devuelven `ActionResult` y se montan
  con `<ActionForm>`.
- Firma: `(tenantSlug, previous, formData)`.
- `confirmRequestAsTripAction` se movió a `request-actions.ts`.
- Botones nuevos:
  - en la tarjeta de viaje: "Aplicar excepcion";
  - en la tarjeta de solicitud: "Enviar";
  - en el portal: "Enviar respuesta", "Enviar borrador a operaciones", "Cancelar solicitud".
- Los botones existentes no cambiaron de nombre.

## Pendiente para la próxima sesión

- **Datos locales:**
  - renovar la póliza VH-1 del seed (usar fechas relativas a "hoy" al correr el seed, o
    re-seed);
  - limpiar los 246 viajes E2E acumulados (`pnpm db:reset` es destructivo: pedir
    autorización);
  - paginar `/trips`.
- **Arreglar el helper `login` de los E2E existentes:** esperar `networkidle` antes de
  `fill`.
- **P1 de la auditoría:**
  - RLS o claves foráneas compuestas;
  - enlaces por UUID;
  - enum de estado de activos;
  - ventana de conflicto basada en la duración y los horarios del conductor;
  - moneda en finanzas;
  - matriz de roles central.
- **Conductor declarando entrega fallida desde la PWA offline:** hoy solo operaciones.
- Nada commiteado (sin autorización de commit).
