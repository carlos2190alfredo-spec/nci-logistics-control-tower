# VERIFICATION LATEST

Fecha: 2026-11-12 (Seed renovable y limpieza de datos E2E acumulados)

## Seed y limpieza de datos locales

| Comando / Verificación | Resultado |
| --- | --- |
| `pnpm e2e:cleanup` (dry-run) | Panatruck: 295 viajes E2E (217 `OFFLINE-E2E-*`, 78 convertidos desde el portal), 78 solicitudes, 101 documentos, 41 adjuntos, 55 incidentes, 664 recibos offline. Se conservan los 10 viajes del seed. TransLogistica: nada que limpiar |
| Respaldo previo | `pg_dump -Fc` de la DB local (1,3 MB) en el scratchpad de la sesión, fuera del repo |
| `pnpm e2e:cleanup --apply` | Aplicado en una transacción. 142 objetos de MinIO borrados. Un segundo dry-run reporta 0 pendientes |
| `pnpm db:seed` (re-ejecución) | Pasa. La póliza VH-1 vence ahora el 2027-01-31; VH-2 sigue vencida a propósito (2026-11-09) |
| `pnpm typecheck`, `pnpm lint` (archivos tocados), `pnpm test` | Pasan: 317 tests |
| ClamAV local | El contenedor `nci-lct-clamav` estaba detenido desde hace 3 meses. Se levantó con `docker compose up -d clamav` (healthy en 40 s) |
| E2E completa, 1.ª corrida (ClamAV detenido) | 86 pasan, 2 fallan, 1 flaky, 12 sin correr, 8,4 min. El dev server ya no se cae en `/trips`. Fallos: FILE-SEC-001 (ClamAV detenido) y E2E-FLOW-001, que recorre el flujo hasta el cierre y solo falla porque la evidencia queda en cuarentena sin antivirus |
| `file-security` + `service-workflow` + `offline-sync` con ClamAV | E2E-FLOW-001 pasa. `file-security` pasa 10/10 en dos corridas aisladas consecutivas |
| E2E completa, 2.ª corrida (ClamAV activo) | 87 pasan, 4 fallan, 4 flaky, 6 sin correr, 30 min. Todos los fallos (FILE-SEC-003/006, OFFLINE-E2E-001/007, E2E-FLOW-003, route-driver-recommendation, EXC-005) quedan en la pantalla de `/login`: es la carrera de hidratación de los helpers `login` (los snapshots de Playwright lo muestran). No es seed ni volumen de datos |

## Helper de login compartido y specs autosuficientes

| Comando / Verificación | Resultado |
| --- | --- |
| `tests/e2e/helpers/auth.ts` | Un único `login()` para las 11 specs: espera la hidratación real del formulario (props de React en el `<form>`), verifica los valores escritos, exige salir de `/login` y completa el TOTP del seed |
| Specs con dependencia de datos sobrantes | FILE-SEC-004 y FILE-SEC-008 crean su propio documento o adjunto (FILE-SEC-008 pasa un PNG real por el pipeline con ClamAV); PHOTO-SYNC/PHOTO-EXIF crean su viaje en `DELIVERY_IN_PROGRESS`. Todos limpian al terminar |
| Selectores con copia oculta durante el streaming | `getByRole("heading")` en el horario del conductor y `select[name='type']:visible` en feedback. Causa de la copia oculta no confirmada |
| `pnpm exec eslint tests/e2e`, `pnpm typecheck` | Pasan |
| **E2E completa (desde DB limpia, ClamAV activo)** | **103/103 pasan, 0 fallos, 0 flaky, 0 reintentos, 0 omitidos (15,2 min)** |

---

## Sesión anterior del mismo día (ADR-035)

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
