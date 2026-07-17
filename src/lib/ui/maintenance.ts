import type { MaintenanceStatus, MaintenanceType, MaintenanceAssetType } from "@/generated/prisma";
import type { StatusTone } from "@/lib/ui/status";

export const maintenanceStatusLabel: Record<MaintenanceStatus, string> = {
  PROGRAMADO: "Programado",
  EN_PROGRESO: "En progreso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export const maintenanceStatusTone: Record<MaintenanceStatus, StatusTone> = {
  PROGRAMADO: "info",
  EN_PROGRESO: "warning",
  COMPLETADO: "success",
  CANCELADO: "neutral",
};

export const maintenanceTypeLabel: Record<MaintenanceType, string> = {
  PREVENTIVO: "Preventivo",
  CORRECTIVO: "Correctivo",
  INSPECCION: "Inspección",
};

export const maintenanceAssetLabel: Record<MaintenanceAssetType, string> = {
  VEHICULO: "Vehículo",
  EQUIPO: "Equipo",
};
