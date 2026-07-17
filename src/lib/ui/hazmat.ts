import type {
  HazmatStatus,
  HazmatClass,
  HazmatComplianceState,
} from "@/generated/prisma";
import type { StatusTone } from "@/lib/ui/status";

export const hazmatStatusLabel: Record<HazmatStatus, string> = {
  ORDEN_RECIBIDA: "Orden recibida",
  VALIDACION_CLIENTE: "Validación de cliente",
  VALIDACION_PRODUCTO: "Validación de producto",
  DOCUMENTACION_PENDIENTE: "Documentación pendiente",
  CONDUCTOR_VALIDADO: "Conductor validado",
  EQUIPO_VALIDADO: "Equipo validado",
  PERMISOS_VALIDADOS: "Permisos validados",
  SEGURO_VALIDADO: "Seguro validado",
  HOJA_SEGURIDAD_ASOCIADA: "Hoja de seguridad asociada",
  RUTA_HORARIO_REVISADOS: "Ruta y horario revisados",
  ELEGIBILIDAD_CALCULADA: "Elegibilidad calculada",
  APROBACION_OPERACIONAL: "Aprobación operacional",
  PROGRAMADA: "Programada",
  UNIDAD_DESPACHADA: "Unidad despachada",
  LLEGADA_PUNTO_CARGA: "Llegada al punto de carga",
  CARGA_CONFIRMADA: "Carga confirmada",
  SALIDA_CONFIRMADA: "Salida confirmada",
  EN_TRANSITO: "En tránsito",
  LLEGADA_DESTINO: "Llegada al destino",
  RECEPCION_INICIADA: "Recepción iniciada",
  RECEPCION_CONFIRMADA: "Recepción confirmada",
  DOCUMENTACION_FINAL: "Documentación final",
  CONCILIACION: "Conciliación",
  EXPEDIENTE_CERRADO: "Expediente cerrado",
  CANCELADA: "Cancelada",
};

export const hazmatStatusTone: Record<HazmatStatus, StatusTone> = {
  ORDEN_RECIBIDA: "info",
  VALIDACION_CLIENTE: "info",
  VALIDACION_PRODUCTO: "info",
  DOCUMENTACION_PENDIENTE: "warning",
  CONDUCTOR_VALIDADO: "progress",
  EQUIPO_VALIDADO: "progress",
  PERMISOS_VALIDADOS: "progress",
  SEGURO_VALIDADO: "progress",
  HOJA_SEGURIDAD_ASOCIADA: "progress",
  RUTA_HORARIO_REVISADOS: "progress",
  ELEGIBILIDAD_CALCULADA: "info",
  APROBACION_OPERACIONAL: "progress",
  PROGRAMADA: "info",
  UNIDAD_DESPACHADA: "progress",
  LLEGADA_PUNTO_CARGA: "progress",
  CARGA_CONFIRMADA: "progress",
  SALIDA_CONFIRMADA: "progress",
  EN_TRANSITO: "progress",
  LLEGADA_DESTINO: "progress",
  RECEPCION_INICIADA: "progress",
  RECEPCION_CONFIRMADA: "success",
  DOCUMENTACION_FINAL: "info",
  CONCILIACION: "info",
  EXPEDIENTE_CERRADO: "success",
  CANCELADA: "danger",
};

export const hazmatClassLabel: Record<HazmatClass, string> = {
  CLASE_1_EXPLOSIVOS: "Clase 1 · Explosivos",
  CLASE_2_GASES: "Clase 2 · Gases",
  CLASE_3_LIQUIDOS_INFLAMABLES: "Clase 3 · Líquidos inflamables",
  CLASE_4_SOLIDOS_INFLAMABLES: "Clase 4 · Sólidos inflamables",
  CLASE_5_COMBURENTES: "Clase 5 · Comburentes",
  CLASE_6_TOXICOS: "Clase 6 · Tóxicos",
  CLASE_7_RADIACTIVOS: "Clase 7 · Radiactivos",
  CLASE_8_CORROSIVOS: "Clase 8 · Corrosivos",
  CLASE_9_VARIOS: "Clase 9 · Varios",
  NO_APLICA: "No aplica",
};

export const hazmatComplianceLabel: Record<HazmatComplianceState, string> = {
  CUMPLE: "Cumple",
  CUMPLE_CON_OBSERVACIONES: "Cumple con observaciones",
  NO_CUMPLE: "No cumple",
  NO_VERIFICADO: "No verificado",
  REQUIERE_APROBACION: "Requiere aprobación",
};

export const hazmatComplianceTone: Record<HazmatComplianceState, StatusTone> = {
  CUMPLE: "success",
  CUMPLE_CON_OBSERVACIONES: "warning",
  NO_CUMPLE: "danger",
  NO_VERIFICADO: "neutral",
  REQUIERE_APROBACION: "info",
};
