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
  DELIVERY_FAILED: "Entrega no completada",
  DELIVERED: "Entrega realizada",
  EVIDENCE_PENDING: "Entrega realizada",
  EVIDENCE_SUBMITTED: "Documentacion disponible",
  EVIDENCE_APPROVED: "Documentacion disponible",
  CLOSED: "Servicio cerrado",
  CANCELLED: "Servicio cancelado",
};

type Transition = {
  from: TripStatus;
  to: TripStatus;
  roles: TenantRole[];
  /**
   * Transicion de excepcion: exige motivo escrito y no aparece en el flujo
   * normal de "Avanzar" ni en la cola offline del conductor.
   */
  requiresReason?: boolean;
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
  DELIVERY_FAILED: "Operaciones coordinará un nuevo intento o el retorno de la carga",
  DELIVERED: "Se preparará la prueba de entrega",
  EVIDENCE_PENDING: "Se preparará la prueba de entrega",
  EVIDENCE_SUBMITTED: "La documentación quedará disponible para descarga",
  EVIDENCE_APPROVED: "La documentación está disponible para descarga",
  CLOSED: "Servicio finalizado",
  CANCELLED: "El servicio fue cancelado. Contacte a operaciones si necesita reprogramarlo",
};

const DRIVER_FLOW_ROLES: TenantRole[] = ["DRIVER", "DISPATCHER", "TENANT_OWNER"];

/** Roles que pueden ejecutar transiciones de excepcion (cancelar, entrega fallida, reintento). */
const EXCEPTION_ROLES: TenantRole[] = ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER", "TENANT_ADMIN"];

/**
 * Despues de cargar, cancelar implica devolver mercancia: solo mandos
 * (no el despachador) pueden hacerlo.
 */
const LATE_CANCEL_ROLES: TenantRole[] = ["OPERATIONS_MANAGER", "TENANT_OWNER", "TENANT_ADMIN"];

/** Estados en los que operaciones puede (re)asignar vehiculo, equipo y conductor. */
export const ASSIGNABLE_TRIP_STATUSES: readonly TripStatus[] = ["CONFIRMED", "SCHEDULED", "ASSIGNED", "DRIVER_CONFIRMED"];

/** Estados en los que el conductor puede registrar evidencia de entrega. */
export const EVIDENCE_SUBMITTABLE_STATUSES: readonly TripStatus[] = [
  "DELIVERY_IN_PROGRESS",
  "DELIVERED",
  "EVIDENCE_PENDING",
  "EVIDENCE_SUBMITTED",
];

/** Estados terminales: ninguna accion operativa los modifica. */
export const TERMINAL_TRIP_STATUSES: readonly TripStatus[] = ["CLOSED", "CANCELLED"];

const EARLY_CANCELLABLE: TripStatus[] = [
  "CONFIRMED",
  "SCHEDULED",
  "ASSIGNED",
  "DRIVER_CONFIRMED",
  "EN_ROUTE_TO_ORIGIN",
  "ARRIVED_AT_ORIGIN",
  "WAITING_AT_ORIGIN",
];

const LATE_CANCELLABLE: TripStatus[] = [
  "LOADING_OR_PICKUP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "DELIVERY_IN_PROGRESS",
  "DELIVERY_FAILED",
];

export const tripTransitions: Transition[] = [
  { from: "REQUESTED", to: "UNDER_REVIEW", roles: ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "UNDER_REVIEW", to: "CONFIRMED", roles: ["OPERATIONS_MANAGER", "DISPATCHER", "TENANT_OWNER"] },
  { from: "CONFIRMED", to: "SCHEDULED", roles: ["DISPATCHER", "TENANT_OWNER"] },
  { from: "SCHEDULED", to: "ASSIGNED", roles: ["DISPATCHER", "TENANT_OWNER"] },
  { from: "ASSIGNED", to: "DRIVER_CONFIRMED", roles: DRIVER_FLOW_ROLES },
  { from: "DRIVER_CONFIRMED", to: "EN_ROUTE_TO_ORIGIN", roles: DRIVER_FLOW_ROLES },
  { from: "EN_ROUTE_TO_ORIGIN", to: "ARRIVED_AT_ORIGIN", roles: DRIVER_FLOW_ROLES },
  { from: "ARRIVED_AT_ORIGIN", to: "WAITING_AT_ORIGIN", roles: DRIVER_FLOW_ROLES },
  // La espera en origen es opcional: si no hubo espera se pasa directo a carga.
  { from: "ARRIVED_AT_ORIGIN", to: "LOADING_OR_PICKUP", roles: DRIVER_FLOW_ROLES },
  { from: "WAITING_AT_ORIGIN", to: "LOADING_OR_PICKUP", roles: DRIVER_FLOW_ROLES },
  { from: "LOADING_OR_PICKUP", to: "IN_TRANSIT", roles: DRIVER_FLOW_ROLES },
  { from: "IN_TRANSIT", to: "ARRIVED_AT_DESTINATION", roles: DRIVER_FLOW_ROLES },
  { from: "ARRIVED_AT_DESTINATION", to: "DELIVERY_IN_PROGRESS", roles: DRIVER_FLOW_ROLES },
  { from: "DELIVERY_IN_PROGRESS", to: "DELIVERED", roles: DRIVER_FLOW_ROLES },
  { from: "DELIVERED", to: "EVIDENCE_PENDING", roles: ["DRIVER", "OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_PENDING", to: "EVIDENCE_SUBMITTED", roles: ["DRIVER", "OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_SUBMITTED", to: "EVIDENCE_APPROVED", roles: ["OPERATIONS_MANAGER", "TENANT_OWNER"] },
  { from: "EVIDENCE_APPROVED", to: "CLOSED", roles: ["OPERATIONS_MANAGER", "TENANT_OWNER"] },

  // --- Excepciones (exigen motivo) ---
  // Entrega fallida: receptor ausente, rechazo de carga, direccion incorrecta...
  { from: "ARRIVED_AT_DESTINATION", to: "DELIVERY_FAILED", roles: EXCEPTION_ROLES, requiresReason: true },
  { from: "DELIVERY_IN_PROGRESS", to: "DELIVERY_FAILED", roles: EXCEPTION_ROLES, requiresReason: true },
  // Reintento de entrega o retorno de la carga: la unidad vuelve a estar en transito.
  { from: "DELIVERY_FAILED", to: "IN_TRANSIT", roles: EXCEPTION_ROLES, requiresReason: true },
  // Cancelacion.
  ...EARLY_CANCELLABLE.map((from) => ({ from, to: "CANCELLED" as const, roles: EXCEPTION_ROLES, requiresReason: true })),
  ...LATE_CANCELLABLE.map((from) => ({ from, to: "CANCELLED" as const, roles: LATE_CANCEL_ROLES, requiresReason: true })),
];

function findTransition(from: TripStatus, to: TripStatus, role: TenantRole) {
  return tripTransitions.find(
    (transition) => transition.from === from && transition.to === to && transition.roles.includes(role),
  );
}

export function canTransition(from: TripStatus, to: TripStatus, role: TenantRole) {
  return findTransition(from, to, role) !== undefined;
}

/** true si la transicion existe y exige motivo escrito. */
export function transitionRequiresReason(from: TripStatus, to: TripStatus, role: TenantRole) {
  return findTransition(from, to, role)?.requiresReason === true;
}

/** Siguientes estados del flujo normal (sin excepciones). */
export function nextStatuses(from: TripStatus, role: TenantRole) {
  return tripTransitions
    .filter((transition) => transition.from === from && transition.roles.includes(role) && !transition.requiresReason)
    .map((transition) => transition.to);
}

/** Transiciones de excepcion disponibles (cancelar, entrega fallida, reintento). */
export function exceptionStatuses(from: TripStatus, role: TenantRole) {
  return tripTransitions
    .filter((transition) => transition.from === from && transition.roles.includes(role) && transition.requiresReason)
    .map((transition) => transition.to);
}

export const MIN_REASON_LENGTH = 5;
