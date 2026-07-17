import type {
  ContainerStatus,
  ContainerType,
  ContainerSize,
  ContainerOperationType,
  ContainerChargeType,
} from "@/generated/prisma";
import type { FreeTimeRisk } from "@/lib/containers/free-time";
import type { StatusTone } from "@/lib/ui/status";

export const containerStatusLabel: Record<ContainerStatus, string> = {
  SOLICITUD_RECIBIDA: "Solicitud recibida",
  VALIDACION_COMERCIAL: "Validación comercial",
  DOCUMENTOS_PENDIENTES: "Documentos pendientes",
  DOCUMENTACION_COMPLETA: "Documentación completa",
  LIBERACION_PENDIENTE: "Liberación pendiente",
  LIBERADO: "Liberado",
  CITA_SOLICITADA: "Cita solicitada",
  CITA_CONFIRMADA: "Cita confirmada",
  UNIDAD_ASIGNADA: "Unidad asignada",
  EN_RUTA_TERMINAL: "En ruta a terminal",
  EN_TERMINAL: "En terminal",
  GATE_IN: "Gate-in",
  RETIRADO: "Contenedor retirado",
  GATE_OUT: "Gate-out",
  EN_TRANSITO: "En tránsito",
  EN_DESTINO: "En destino",
  ENTREGA_INICIADA: "Entrega iniciada",
  ENTREGA_COMPLETADA: "Entrega completada",
  POD_GENERADO: "POD generado",
  VACIO_PENDIENTE: "Vacío pendiente",
  DEVOLUCION_PROGRAMADA: "Devolución programada",
  VACIO_DEVUELTO: "Vacío devuelto",
  EIR_CONFIRMADO: "EIR confirmado",
  CARGOS_CONCILIADOS: "Cargos conciliados",
  EXPEDIENTE_CERRADO: "Expediente cerrado",
  CANCELADO: "Cancelado",
};

export const containerStatusTone: Record<ContainerStatus, StatusTone> = {
  SOLICITUD_RECIBIDA: "info",
  VALIDACION_COMERCIAL: "info",
  DOCUMENTOS_PENDIENTES: "warning",
  DOCUMENTACION_COMPLETA: "info",
  LIBERACION_PENDIENTE: "warning",
  LIBERADO: "progress",
  CITA_SOLICITADA: "info",
  CITA_CONFIRMADA: "progress",
  UNIDAD_ASIGNADA: "progress",
  EN_RUTA_TERMINAL: "progress",
  EN_TERMINAL: "progress",
  GATE_IN: "progress",
  RETIRADO: "progress",
  GATE_OUT: "progress",
  EN_TRANSITO: "progress",
  EN_DESTINO: "progress",
  ENTREGA_INICIADA: "progress",
  ENTREGA_COMPLETADA: "success",
  POD_GENERADO: "success",
  VACIO_PENDIENTE: "warning",
  DEVOLUCION_PROGRAMADA: "info",
  VACIO_DEVUELTO: "success",
  EIR_CONFIRMADO: "success",
  CARGOS_CONCILIADOS: "success",
  EXPEDIENTE_CERRADO: "success",
  CANCELADO: "danger",
};

export const containerTypeLabel: Record<ContainerType, string> = {
  SECO: "Seco",
  REFRIGERADO: "Refrigerado",
  OPEN_TOP: "Open top",
  FLAT_RACK: "Flat rack",
  TANQUE: "Tanque",
  ESPECIAL: "Especial",
};

export const containerSizeLabel: Record<ContainerSize, string> = {
  S20: "20'",
  S40: "40'",
  S45: "45'",
  OTRO: "Otro",
};

export const containerOperationLabel: Record<ContainerOperationType, string> = {
  IMPORTACION: "Importación",
  EXPORTACION: "Exportación",
  TRANSITO: "Tránsito",
  REEXPORTACION: "Reexportación",
  MOVIMIENTO_NACIONAL: "Movimiento nacional",
};

export const containerChargeLabel: Record<ContainerChargeType, string> = {
  ALMACENAJE_PORTUARIO: "Almacenaje portuario",
  DEMURRAGE: "Demurrage",
  DETENTION: "Detention",
  RETENCION: "Retención",
  ESPERA: "Espera",
  STANDBY: "Standby",
  MANIOBRAS: "Maniobras",
  SOBRECOSTO: "Sobrecosto",
  REENTREGA: "Reentrega",
  REPROGRAMACION: "Reprogramación",
  TERCEROS: "Cargos de terceros",
};

export const freeTimeRiskLabel: Record<FreeTimeRisk, string> = {
  SIN_RIESGO: "Sin riesgo",
  RIESGO_PROXIMO: "Riesgo próximo",
  RIESGO_ALTO: "Riesgo alto",
  CARGO_ACUMULANDOSE: "Cargo acumulándose",
  CARGO_CERRADO: "Cargo cerrado",
};

export const freeTimeRiskTone: Record<FreeTimeRisk, StatusTone> = {
  SIN_RIESGO: "success",
  RIESGO_PROXIMO: "warning",
  RIESGO_ALTO: "warning",
  CARGO_ACUMULANDOSE: "danger",
  CARGO_CERRADO: "neutral",
};
