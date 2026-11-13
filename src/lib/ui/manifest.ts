import type { TripStatus } from "@/generated/prisma";

/**
 * Los seis hitos del "manifiesto" que ve el cliente (direccion creativa B,
 * docs/design/CREATIVE_DIRECTION.md). Agrupa los estados internos del viaje en
 * etapas que el cliente entiende; nunca expone estados internos de operacion.
 */
export const MANIFEST_STAGES = [
  "Solicitud",
  "Asignación",
  "En ruta",
  "Entrega",
  "Evidencia",
  "POD",
] as const;

export type ManifestStageState = "done" | "current" | "pending";

const stageByStatus: Record<TripStatus, number> = {
  REQUESTED: 0,
  UNDER_REVIEW: 0,
  INFORMATION_REQUIRED: 0,
  CONFIRMED: 0,
  SCHEDULED: 1,
  ASSIGNED: 1,
  DRIVER_CONFIRMED: 1,
  EN_ROUTE_TO_ORIGIN: 2,
  ARRIVED_AT_ORIGIN: 2,
  WAITING_AT_ORIGIN: 2,
  LOADING_OR_PICKUP: 2,
  IN_TRANSIT: 2,
  ARRIVED_AT_DESTINATION: 2,
  DELIVERY_IN_PROGRESS: 3,
  DELIVERY_FAILED: 3,
  DELIVERED: 3,
  EVIDENCE_PENDING: 4,
  EVIDENCE_SUBMITTED: 4,
  EVIDENCE_APPROVED: 5,
  CLOSED: 5,
  CANCELLED: 0,
};

export function manifestStageIndex(status: TripStatus): number {
  return stageByStatus[status];
}

/** Estado de cada hito. Un viaje cerrado tiene todos sellados; uno cancelado ninguno. */
export function manifestStages(
  status: TripStatus,
): { label: string; state: ManifestStageState }[] {
  const current = stageByStatus[status];
  return MANIFEST_STAGES.map((label, index) => {
    if (status === "CANCELLED") return { label, state: "pending" as const };
    if (status === "CLOSED" || index < current)
      return { label, state: "done" as const };
    return {
      label,
      state: index === current ? ("current" as const) : ("pending" as const),
    };
  });
}
