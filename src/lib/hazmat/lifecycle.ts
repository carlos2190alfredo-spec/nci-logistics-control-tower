import type { HazmatStatus } from "@/generated/prisma";

/**
 * Ciclo de vida de una orden de carga peligrosa — máquina de estados
 * DETERMINISTA. Secuencia canónica; desde cualquier estado activo se puede
 * CANCELAR. La IA no participa en estas transiciones.
 */
export const HAZMAT_SEQUENCE: HazmatStatus[] = [
  "ORDEN_RECIBIDA",
  "VALIDACION_CLIENTE",
  "VALIDACION_PRODUCTO",
  "DOCUMENTACION_PENDIENTE",
  "CONDUCTOR_VALIDADO",
  "EQUIPO_VALIDADO",
  "PERMISOS_VALIDADOS",
  "SEGURO_VALIDADO",
  "HOJA_SEGURIDAD_ASOCIADA",
  "RUTA_HORARIO_REVISADOS",
  "ELEGIBILIDAD_CALCULADA",
  "APROBACION_OPERACIONAL",
  "PROGRAMADA",
  "UNIDAD_DESPACHADA",
  "LLEGADA_PUNTO_CARGA",
  "CARGA_CONFIRMADA",
  "SALIDA_CONFIRMADA",
  "EN_TRANSITO",
  "LLEGADA_DESTINO",
  "RECEPCION_INICIADA",
  "RECEPCION_CONFIRMADA",
  "DOCUMENTACION_FINAL",
  "CONCILIACION",
  "EXPEDIENTE_CERRADO",
];

const TERMINAL: ReadonlySet<HazmatStatus> = new Set(["EXPEDIENTE_CERRADO", "CANCELADA"]);

/**
 * El paso a la fase de despacho (UNIDAD_DESPACHADA) requiere aprobación previa:
 * ese avance solo debe permitirse si el estado actual es APROBACION_OPERACIONAL
 * y la orden fue aprobada. Se marca aquí para que el server lo haga cumplir.
 */
export const HAZMAT_DISPATCH_STATUS: HazmatStatus = "UNIDAD_DESPACHADA";

export function nextHazmatStatuses(current: HazmatStatus): HazmatStatus[] {
  if (TERMINAL.has(current)) return [];
  const idx = HAZMAT_SEQUENCE.indexOf(current);
  const out: HazmatStatus[] = [];
  if (idx >= 0 && idx < HAZMAT_SEQUENCE.length - 1) {
    out.push(HAZMAT_SEQUENCE[idx + 1]);
  }
  out.push("CANCELADA");
  return out;
}

export function canTransitionHazmat(current: HazmatStatus, next: HazmatStatus): boolean {
  return nextHazmatStatuses(current).includes(next);
}
