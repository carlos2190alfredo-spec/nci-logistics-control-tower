import type { TenantRole, TripStatus } from "@/generated/prisma";

export const customerVisibleStatus: Record<TripStatus, string> = {
  REQUESTED: "Solicitud recibida",
  UNDER_REVIEW: "Solicitud recibida",
  INFORMATION_REQUIRED: "Informacion pendiente",
  CONFIRMED: "Servicio confirmado",
  SCHEDULED: "Servicio confirmado",
  ASSIGNED: "Unidad asignada",
  DRIVER_CONFIRMED: "Unidad asignada",
  EN_ROUTE_TO_ORIGIN: "En camino al origen",
  ARRIVED_AT_ORIGIN: "Operacion en origen",
  WAITING_AT_ORIGIN: "Operacion en origen",
  LOADING_OR_PICKUP: "Operacion en origen",
  IN_TRANSIT: "En transito",
  ARRIVED_AT_DESTINATION: "Llegada al destino",
  DELIVERY_IN_PROGRESS: "Llegada al destino",
  DELIVERED: "Entrega realizada",
  EVIDENCE_PENDING: "Entrega realizada",
  EVIDENCE_SUBMITTED: "Documentacion disponible",
  EVIDENCE_APPROVED: "Documentacion disponible",
  CLOSED: "Servicio cerrado",
  CANCELLED: "Servicio cerrado",
};

type Transition = {
  from: TripStatus;
  to: TripStatus;
  roles: TenantRole[];
};

/**
 * Próximo hito, en lenguaje natural, para mostrar al cliente en el portal.
 * Responde "¿qué sigue?" sin exponer estados técnicos.
 */
export const customerNextStep: Record<TripStatus, string> = {
  REQUESTED: "Operaciones revisará su solicitud",
  UNDER_REVIEW: "Operaciones revisará su solicitud",
  INFORMATION_REQUIRED: "Necesitamos un dato suyo para continuar",
  CONFIRMED: "Se asignará una unidad y un conductor",
  SCHEDULED: "Se asignará una unidad y un conductor",
  ASSIGNED: "El conductor confirmará e irá al origen",
  DRIVER_CONFIRMED: "El conductor se dirigirá al punto de origen",
  EN_ROUTE_TO_ORIGIN: "El conductor llegará al punto de origen",
  ARRIVED_AT_ORIGIN: "Se realizará la carga",
  WAITING_AT_ORIGIN: "Se realizará la carga",
  LOADING_OR_PICKUP: "La unidad saldrá hacia el destino",
  IN_TRANSIT: "La unidad llegará al destino",
  ARRIVED_AT_DESTINATION: "Se realizará la entrega",
  DELIVERY_IN_PROGRESS: "Se completará la entrega",
  DELIVERED: "Se preparará la prueba de entrega",
  EVIDENCE_PENDING: "Se preparará la prueba de entrega",
  EVIDENCE_SUBMITTED: "La documentación quedará disponible para descarga",
  EVIDENCE_APPROVED: "La documentación está disponible para descarga",
  CLOSED: "Servicio finalizado",
  CANCELLED: "Servicio finalizado",
};

export const tripTransitions: Transition[] = [
  { from: "REQUESTED", to: "UNDER_REVIEW", roles: ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "UNDER_REVIEW", to: "CONFIRMED", roles: ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "CONFIRMED", to: "SCHEDULED", roles: ["DISPATCHER", "TENANT_OWNER"] },
  { from: "SCHEDULED", to: "ASSIGNED", roles: ["DISPATCHER", "TENANT_OWNER"] },
  { from: "ASSIGNED", to: "DRIVER_CONFIRMED", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "DRIVER_CONFIRMED", to: "EN_ROUTE_TO_ORIGIN", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "EN_ROUTE_TO_ORIGIN", to: "ARRIVED_AT_ORIGIN", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "ARRIVED_AT_ORIGIN", to: "WAITING_AT_ORIGIN", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "WAITING_AT_ORIGIN", to: "LOADING_OR_PICKUP", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "LOADING_OR_PICKUP", to: "IN_TRANSIT", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "IN_TRANSIT", to: "ARRIVED_AT_DESTINATION", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "ARRIVED_AT_DESTINATION", to: "DELIVERY_IN_PROGRESS", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "DELIVERY_IN_PROGRESS", to: "DELIVERED", roles: ["DRIVER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "DELIVERED", to: "EVIDENCE_PENDING", roles: ["DRIVER", "OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_PENDING", to: "EVIDENCE_SUBMITTED", roles: ["DRIVER", "OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_SUBMITTED", to: "EVIDENCE_APPROVED", roles: ["OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_APPROVED", to: "CLOSED", roles: ["OPERATIONS_MANAGER", "TENANT_OWNER"] },
];

export function canTransition(from: TripStatus, to: TripStatus, role: TenantRole) {
  return tripTransitions.some((transition) => {
    return transition.from === from && transition.to === to && transition.roles.includes(role);
  });
}

export function nextStatuses(from: TripStatus, role: TenantRole) {
  return tripTransitions
    .filter((transition) => transition.from === from && transition.roles.includes(role))
    .map((transition) => transition.to);
}
