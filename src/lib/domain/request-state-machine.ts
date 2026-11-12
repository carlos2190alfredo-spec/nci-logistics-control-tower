import type { ServiceRequestStatus } from "@/generated/prisma";

/**
 * Ciclo de vida de una solicitud de servicio (portal cliente -> operaciones).
 * PURO: sin base de datos. Las server actions validan aqui antes de mutar y
 * repiten la condicion en el WHERE del update (bloqueo optimista).
 */

export type RequestAction =
  /** Operaciones convierte la solicitud en viaje. */
  | "convert"
  /** Operaciones pide un dato al cliente. */
  | "request_info"
  /** Operaciones rechaza la solicitud. */
  | "reject"
  /** El cliente responde al pedido de informacion. */
  | "provide_info"
  /** El cliente envia un borrador. */
  | "submit_draft"
  /** El cliente cancela su solicitud. */
  | "cancel";

type RequestTransition = {
  from: readonly ServiceRequestStatus[];
  to: ServiceRequestStatus;
  actor: "OPERATIONS" | "CUSTOMER";
  requiresReason: boolean;
};

export const requestTransitions: Record<RequestAction, RequestTransition> = {
  convert: { from: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"], to: "CONVERTED", actor: "OPERATIONS", requiresReason: false },
  request_info: { from: ["REQUESTED", "UNDER_REVIEW"], to: "INFORMATION_REQUIRED", actor: "OPERATIONS", requiresReason: true },
  reject: {
    from: ["REQUESTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "CONFIRMED"],
    to: "REJECTED",
    actor: "OPERATIONS",
    requiresReason: true,
  },
  provide_info: { from: ["INFORMATION_REQUIRED"], to: "UNDER_REVIEW", actor: "CUSTOMER", requiresReason: true },
  submit_draft: { from: ["DRAFT"], to: "REQUESTED", actor: "CUSTOMER", requiresReason: false },
  cancel: {
    from: ["DRAFT", "REQUESTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "CONFIRMED"],
    to: "CANCELLED",
    actor: "CUSTOMER",
    requiresReason: false,
  },
};

export function canApplyRequestAction(status: ServiceRequestStatus, action: RequestAction): boolean {
  return requestTransitions[action].from.includes(status);
}

/** Acciones disponibles para un actor en el estado actual. */
export function availableRequestActions(status: ServiceRequestStatus, actor: "OPERATIONS" | "CUSTOMER"): RequestAction[] {
  return (Object.keys(requestTransitions) as RequestAction[]).filter(
    (action) => requestTransitions[action].actor === actor && canApplyRequestAction(status, action),
  );
}

/** Estados que operaciones ve en su bandeja de solicitudes por atender. */
export const OPERATIONS_INBOX_REQUEST_STATUSES: ServiceRequestStatus[] = [
  "REQUESTED",
  "UNDER_REVIEW",
  "INFORMATION_REQUIRED",
  "CONFIRMED",
];
