import type { ContainerStatus } from "@/generated/prisma";

/**
 * Ciclo de vida del contenedor — máquina de estados DETERMINISTA.
 * Secuencia canónica del camino feliz. Desde casi cualquier estado activo se
 * puede CANCELAR. La IA no participa en estas transiciones.
 */
export const CONTAINER_SEQUENCE: ContainerStatus[] = [
  "SOLICITUD_RECIBIDA",
  "VALIDACION_COMERCIAL",
  "DOCUMENTOS_PENDIENTES",
  "DOCUMENTACION_COMPLETA",
  "LIBERACION_PENDIENTE",
  "LIBERADO",
  "CITA_SOLICITADA",
  "CITA_CONFIRMADA",
  "UNIDAD_ASIGNADA",
  "EN_RUTA_TERMINAL",
  "EN_TERMINAL",
  "GATE_IN",
  "RETIRADO",
  "GATE_OUT",
  "EN_TRANSITO",
  "EN_DESTINO",
  "ENTREGA_INICIADA",
  "ENTREGA_COMPLETADA",
  "POD_GENERADO",
  "VACIO_PENDIENTE",
  "DEVOLUCION_PROGRAMADA",
  "VACIO_DEVUELTO",
  "EIR_CONFIRMADO",
  "CARGOS_CONCILIADOS",
  "EXPEDIENTE_CERRADO",
];

const TERMINAL: ReadonlySet<ContainerStatus> = new Set(["EXPEDIENTE_CERRADO", "CANCELADO"]);

/**
 * Estados a los que se puede avanzar desde `current`:
 * el siguiente de la secuencia (si existe) más CANCELADO (salvo terminales).
 */
export function nextContainerStatuses(current: ContainerStatus): ContainerStatus[] {
  if (TERMINAL.has(current)) return [];
  const idx = CONTAINER_SEQUENCE.indexOf(current);
  const out: ContainerStatus[] = [];
  if (idx >= 0 && idx < CONTAINER_SEQUENCE.length - 1) {
    out.push(CONTAINER_SEQUENCE[idx + 1]);
  }
  out.push("CANCELADO");
  return out;
}

/** ¿Es válida la transición current → next? */
export function canTransitionContainer(current: ContainerStatus, next: ContainerStatus): boolean {
  return nextContainerStatuses(current).includes(next);
}

/**
 * Campo de fecha que debe estamparse al ENTRAR a un estado, si aplica.
 * Estas fechas alimentan el cómputo determinista de free-time.
 */
export function dateStampForStatus(
  status: ContainerStatus,
): "gateInAt" | "gateOutAt" | "emptyReturnedAt" | "eirConfirmedAt" | null {
  switch (status) {
    case "GATE_IN":
      return "gateInAt";
    case "GATE_OUT":
      return "gateOutAt";
    case "VACIO_DEVUELTO":
      return "emptyReturnedAt";
    case "EIR_CONFIRMADO":
      return "eirConfirmedAt";
    default:
      return null;
  }
}
