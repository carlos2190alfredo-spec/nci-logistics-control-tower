# ADR-035: Flujos de excepción, resultados tipados y bloqueo optimista en el núcleo operativo

Estado: Aceptado
Fecha: 2026-11-12

## Contexto

La auditoría de 2026-11-12 encontró cuatro problemas P0 en el flujo de viajes y solicitudes:

1. `CANCELLED` existía en el enum de viajes, pero ninguna transición llegaba a él. En
   solicitudes, `INFORMATION_REQUIRED`, `REJECTED`, `CANCELLED` y el envío de `DRAFT` no
   tenían acción. No se podía cancelar ni rechazar nada.
2. El flujo era lineal: no había entrega fallida, reintento o retorno, ni reasignación tras
   la confirmación del conductor. La espera en origen era obligatoria.
3. Las server actions de viaje terminaban con `return;` silenciosos: el despachador no
   sabía si una asignación se bloqueó por cumplimiento, mantenimiento o conflicto.
4. Carreras de concurrencia:
   - Las transiciones (online y la cola offline) leían el estado y luego hacían `update`
     solo por `id`.
   - La verificación de conflicto de agenda corría fuera de la transacción, así que dos
     asignaciones podían reservar el mismo conductor.

## Decisión

### Máquina de estados de viaje (`src/lib/domain/state-machine.ts`)

- Nuevo estado `DELIVERY_FAILED` (migración aditiva
  `20261112120000_trip_exceptions_and_request_reasons`).
- Las transiciones llevan `requiresReason`. Las de excepción:
  - `ARRIVED_AT_DESTINATION | DELIVERY_IN_PROGRESS → DELIVERY_FAILED`.
  - `DELIVERY_FAILED → IN_TRANSIT` (reintento o retorno de la carga).
  - `→ CANCELLED` desde todos los estados previos a la entrega:
    - antes de cargar: `OPERATIONS_MANAGER`, `DISPATCHER`, `TENANT_OWNER`, `TENANT_ADMIN`;
    - desde `LOADING_OR_PICKUP` en adelante: solo mandos, sin `DISPATCHER`.
- `DRIVER` no ejecuta excepciones. El conductor reporta incidencias y operaciones decide.
  La whitelist offline (`DRIVER_ALLOWED_TRANSITIONS`) no cambia.
- `ARRIVED_AT_ORIGIN → LOADING_OR_PICKUP` permite saltar la espera. `WAITING_AT_ORIGIN`
  sigue siendo la primera opción para no cambiar el comportamiento por defecto.
- `nextStatuses()` devuelve solo el flujo normal. `exceptionStatuses()` devuelve las
  excepciones.
- `ASSIGNABLE_TRIP_STATUSES` incluye `DRIVER_CONFIRMED`. Una reasignación vuelve a
  `ASSIGNED` para que el nuevo conductor confirme. La cola offline del conductor anterior
  recibe `ASSIGNMENT_CHANGED`, como ya hacía.
- El motivo se guarda en `TripEvent.reason`, que es interno y nunca se renderiza en el
  portal. El cliente ve una nota genérica (`customerExceptionNote`) y el nuevo estado.

### Máquina de estados de solicitud (`src/lib/domain/request-state-machine.ts`)

| Acción | Actor | Desde | Hacia | Motivo |
|---|---|---|---|---|
| `convert` | Operaciones | REQUESTED, UNDER_REVIEW, CONFIRMED | CONVERTED | — |
| `request_info` | Operaciones | REQUESTED, UNDER_REVIEW | INFORMATION_REQUIRED | Obligatorio (visible al cliente) |
| `reject` | Operaciones | REQUESTED, UNDER_REVIEW, INFORMATION_REQUIRED, CONFIRMED | REJECTED | Obligatorio (visible al cliente) |
| `provide_info` | Cliente | INFORMATION_REQUIRED | UNDER_REVIEW | Obligatorio (se anexa a `customerNotes`) |
| `submit_draft` | Cliente | DRAFT | REQUESTED | — |
| `cancel` | Cliente | DRAFT…CONFIRMED | CANCELLED | Opcional |

- El motivo visible al cliente vive en `ServiceRequest.statusReason`.
- Las acciones viven en `src/lib/server/request-actions.ts`, el primer paso para partir
  `actions.ts`.

### Resultados tipados

- `ActionResult` (`src/lib/server/action-result.ts`) y el componente
  `ActionForm` (`useActionState`) reemplazan los `return;` silenciosos en estas acciones:
  - asignar y transicionar viajes;
  - registrar, aprobar y rechazar evidencia;
  - convertir, revisar y actualizar solicitudes.

  Cada bloqueo devuelve un mensaje en español con la causa concreta: documento vencido,
  orden de mantenimiento, viaje que ocupa el recurso o estado actual.

### Concurrencia

- **Transiciones online y offline.** `updateMany` con `WHERE status = <leído>`, más
  `driverId` cuando actúa el conductor. Si afecta 0 filas, la transacción hace rollback:
  - online: se informa al usuario;
  - offline: se registra un receipt `CONFLICT`, o se devuelve `ASSIGNMENT_CHANGED` si el
    viaje cambió de conductor.

  El receipt sigue creándose primero dentro de la transacción, como exige VULN-001.
- **Asignación.** Dentro de la transacción se toman `SELECT … FOR UPDATE` en orden fijo
  (viaje → vehículo → equipo → conductor) y después corre la consulta de conflicto. Con
  READ COMMITTED, la segunda transacción espera el lock y ve lo que confirmó la primera.
  El orden fijo evita deadlocks.
- **Solicitudes y evidencia.** Las conversiones de solicitud y la aprobación o rechazo de
  evidencia usan `updateMany` condicionado al estado esperado.
- **Rechazo de evidencia.** Ahora devuelve el viaje a `EVIDENCE_PENDING`. Antes quedaba en
  `EVIDENCE_SUBMITTED` aunque el evento decía `EVIDENCE_PENDING`.

### Bypass cerrado

`acceptDriverRecommendationAction` y `overrideDriverRecommendationAction` escribían
`trip.driverId` directamente, sin guardas de estado, cumplimiento, mantenimiento ni agenda.
Ninguna pantalla las usa, pero como server actions exportadas son invocables. Ahora solo
registran la decisión. La asignación real pasa siempre por `assignTripAction`.

## Consecuencias

- La revalidación de las acciones de viaje y solicitud usa
  `revalidatePath('/t/<slug>', 'layout')`, porque `/trips` y `/requests` no se refrescaban
  con la ruta raíz.
- React 19 resetea los campos no controlados del formulario tras cada envío, incluso con
  error. El usuario debe volver a elegir los recursos tras un bloqueo, o volver a firmar
  si falla el registro de evidencia.
- La ventana de conflicto sigue fija en ±6 h. Usar `expectedDuration` y
  `DriverWorkSchedule` queda como P1 (auditoría, ítem 7).
- Cumplimiento y mantenimiento siguen enlazados por código de activo en texto (P1, ítem 6).

## Verificación

- Unit: `state-machine.test.ts` (+8 casos) y `request-state-machine.test.ts` (6 casos).
- E2E: `tests/e2e/trip-exceptions.spec.ts`:
  - EXC-001: cancelar;
  - EXC-002: entrega fallida y reintento;
  - EXC-003: envío obsoleto;
  - EXC-004: mensaje de conflicto de agenda;
  - EXC-005: dos asignaciones simultáneas del mismo conductor, gana exactamente una;
  - EXC-006: pedir información, respuesta del cliente y rechazo.
