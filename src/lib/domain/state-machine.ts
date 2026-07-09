import type { TenantRole, TripStatus } from "@/generated/prisma/enums";

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
