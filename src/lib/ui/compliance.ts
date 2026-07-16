import type {
  ComplianceDocStatus,
  ComplianceSeverity,
  ComplianceEntityType,
} from "@/generated/prisma";
import type { StatusTone } from "@/lib/ui/status";

export const complianceStatusLabel: Record<ComplianceDocStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_REVISION: "En revisión",
  VIGENTE: "Vigente",
  PROXIMO_A_VENCER: "Próximo a vencer",
  VENCIDO: "Vencido",
  RECHAZADO: "Rechazado",
  SUSPENDIDO: "Suspendido",
  REEMPLAZADO: "Reemplazado",
  NO_APLICABLE: "No aplicable",
};

export const complianceStatusTone: Record<ComplianceDocStatus, StatusTone> = {
  PENDIENTE: "neutral",
  EN_REVISION: "info",
  VIGENTE: "success",
  PROXIMO_A_VENCER: "warning",
  VENCIDO: "danger",
  RECHAZADO: "danger",
  SUSPENDIDO: "danger",
  REEMPLAZADO: "neutral",
  NO_APLICABLE: "neutral",
};

export const complianceSeverityLabel: Record<ComplianceSeverity, string> = {
  INFO: "Informativa",
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const complianceSeverityTone: Record<ComplianceSeverity, StatusTone> = {
  INFO: "neutral",
  BAJA: "info",
  MEDIA: "progress",
  ALTA: "warning",
  CRITICA: "danger",
};

export const complianceEntityLabel: Record<ComplianceEntityType, string> = {
  TENANT: "Empresa",
  CLIENTE: "Cliente",
  PROVEEDOR: "Proveedor",
  SUBCONTRATISTA: "Subcontratista",
  CONDUCTOR: "Conductor",
  VEHICULO: "Vehículo",
  EQUIPO: "Equipo",
  CONTENEDOR: "Contenedor",
  MERCANCIA: "Mercancía",
  ORDEN: "Orden",
  VIAJE: "Viaje",
  CONTRATO: "Contrato",
  RUTA: "Ruta",
  TERMINAL: "Terminal",
  NAVIERA: "Naviera",
  AEROPUERTO: "Aeropuerto",
};

/** Semáforo global de una entidad según el peor documento que la afecta. */
export type ComplianceLight = "VERDE" | "AMARILLO" | "ROJO" | "GRIS";

export const complianceLightLabel: Record<ComplianceLight, string> = {
  VERDE: "Habilitado",
  AMARILLO: "Con advertencias",
  ROJO: "No habilitado",
  GRIS: "Información incompleta",
};

export const complianceLightTone: Record<ComplianceLight, StatusTone> = {
  VERDE: "success",
  AMARILLO: "warning",
  ROJO: "danger",
  GRIS: "neutral",
};
