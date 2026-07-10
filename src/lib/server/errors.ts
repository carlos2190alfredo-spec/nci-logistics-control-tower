/**
 * Códigos de error seguros expuestos al cliente. Los detalles técnicos quedan
 * en logs; hacia afuera solo viajan estos códigos + mensaje corto en español.
 */

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  ACCESS_DENIED: "ACCESS_DENIED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  STATE_CONFLICT: "STATE_CONFLICT",
  ASSIGNMENT_CHANGED: "ASSIGNMENT_CHANGED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  RATE_LIMITED: "RATE_LIMITED",
  UPLOAD_REJECTED: "UPLOAD_REJECTED",
  SYNC_RETRYABLE: "SYNC_RETRYABLE",
  SYNC_REJECTED: "SYNC_REJECTED",
  ORIGIN_MISMATCH: "ORIGIN_MISMATCH",
  PAYLOAD_TAMPERED: "PAYLOAD_TAMPERED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const errorMessages: Record<ErrorCode, string> = {
  AUTH_REQUIRED: "Sesion requerida.",
  SESSION_EXPIRED: "Su sesion expiro. Vuelva a iniciar sesion.",
  ACCESS_DENIED: "No tiene acceso a este recurso.",
  RESOURCE_NOT_FOUND: "Recurso no disponible.",
  STATE_CONFLICT: "El estado actual del viaje no permite esta accion.",
  ASSIGNMENT_CHANGED: "La asignacion del viaje cambio.",
  INVALID_PAYLOAD: "Datos invalidos.",
  RATE_LIMITED: "Demasiadas solicitudes. Reintente en unos segundos.",
  UPLOAD_REJECTED: "Archivo rechazado.",
  SYNC_RETRYABLE: "Error temporal, se reintentara.",
  SYNC_REJECTED: "Accion rechazada.",
  ORIGIN_MISMATCH: "Origen no permitido.",
  PAYLOAD_TAMPERED: "El contenido de la solicitud fue alterado.",
};
