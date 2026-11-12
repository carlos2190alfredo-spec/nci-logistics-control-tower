# VERIFICATION LATEST

Fecha: 2026-11-12 (Remediación P0 del núcleo operativo — ADR-035)

## Resultados ejecutados

| Comando / Verificación | Resultado |
| --- | --- |
| `pnpm typecheck` | Pasa |
| `pnpm lint` | Pasa: 0 errores, 0 warnings |
| `pnpm test` (Vitest) | Pasa: 33 archivos, 317 tests (14 nuevos de máquinas de estado) |
| `pnpm security:check` | Pasa: 77/77 |
| `pnpm build` | Pasa |
| `prisma migrate deploy` + `migrate diff` contra la DB local | Migración aplicada, diff vacío (sin drift) |
| E2E `trip-exceptions.spec.ts` (EXC-001…006) | 6/6 pasan. Se ejecutaron en tandas, sin reintentos; no en una sola corrida |
| E2E `offline-sync.spec.ts` | 9/9 pasan, sin reintentos (corrida aislada) |
| E2E `service-workflow.spec.ts` E2E-FLOW-001 | Ver "Hallazgos de entorno" |
| E2E `panama-modules.spec.ts` (sin el test de selects de mantenimiento) | Pasan en corrida aislada |
| E2E `route-driver-recommendation.spec.ts` | 1 fallo + 1 flaky. Ver "Hallazgos de entorno" |

## Hallazgos de entorno (no son regresiones de ADR-035)

1. **La póliza de VH-1 del seed venció por calendario.** El seed usa `day(80)` desde
   julio, así que vence el 2026-10-05. La guarda de cumplimiento, cuya lógica no cambió,
   bloquea VH-1 y E2E-FLOW-001 no puede asignar. Antes el bloqueo era silencioso; ahora la
   UI lo explica.
   - Verificación: con una excepción de cumplimiento temporal para `VEHICULO:VH-1`, creada
     y borrada en la misma sesión, el flujo llegó a `EVIDENCE_SUBMITTED`. Recorrió
     asignación, los 10 avances del conductor y el registro de evidencia.
   - La aprobación del POD y el cierre se completaron con un spec temporal (ya borrado):
     `EVIDENCE_APPROVED` → POD generado → `CLOSED`, `proofReady=true`.
   - El test original agotó su timeout de 240 s cargando `/trips`.
2. **La DB local acumula 246 viajes activos de corridas previas.** `/t/panatruck-demo/trips`
   en `next dev` tarda minutos y llega a tumbar el dev server. Desde ese punto, todas las
   suites posteriores fallan con `ERR_CONNECTION_REFUSED`.
   - A/B: el test "los selects de asignación deshabilitan el vehículo en mantenimiento"
     **también falla sobre el código base sin cambios** (`git stash`: timeout de 60 s en
     `page.goto('/trips')`).
3. **`route-driver-recommendation.spec.ts`:**
   - el snapshot del fallo queda en `/login` con los valores por defecto del formulario
     (carrera de hidratación del helper `login`);
   - `getByText('Horario Semanal')` encuentra 2 elementos en la página de horarios.

   Ninguna de esas páginas se tocó en esta sesión.
4. `tests/e2e/global-setup.ts` no carga `.env.local`: hay que exportar las variables antes
   de `playwright test`.

## No ejecutado

- Suite E2E completa en una sola corrida verde (bloqueada por el punto 2).
- Prueba de concurrencia directa del `updateMany` de transiciones. El envío obsoleto se
  probó vía UI (EXC-003) y la carrera real de asignación con EXC-005.

## Conteos

| Tipo | Cantidad |
| --- | --- |
| Unit tests (Vitest) | 317 |
| E2E specs | 13 (nuevo: `trip-exceptions.spec.ts`) |
| Security checks | 77 |
| Prisma migrations | 23 |
| ADRs | 35 |
