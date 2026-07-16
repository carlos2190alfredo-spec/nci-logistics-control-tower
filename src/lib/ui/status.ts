import type {
  CustomerRole,
  FileStatus,
  IncidentPriority,
  IncidentStatus,
  NotificationChannel,
  ProofStatus,
  ServiceRequestStatus,
  TenantRole,
  TenantStatus,
  TripStatus,
} from "@/generated/prisma";

/**
 * Etiquetas en español y tonos semánticos para todos los estados del dominio.
 * Los valores enum nunca se muestran crudos al usuario; los formularios siguen
 * enviando el valor enum (value=enum, label=español) para no romper el backend.
 */

export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

export const tripStatusLabel: Record<TripStatus, string> = {
  REQUESTED: "Solicitado",
  UNDER_REVIEW: "En revision",
  INFORMATION_REQUIRED: "Requiere informacion",
  CONFIRMED: "Confirmado",
  SCHEDULED: "Programado",
  ASSIGNED: "Asignado",
  DRIVER_CONFIRMED: "Conductor confirmado",
  EN_ROUTE_TO_ORIGIN: "En ruta al origen",
  ARRIVED_AT_ORIGIN: "En origen",
  WAITING_AT_ORIGIN: "Espera en origen",
  LOADING_OR_PICKUP: "Cargando",
  IN_TRANSIT: "En transito",
  ARRIVED_AT_DESTINATION: "En destino",
  DELIVERY_IN_PROGRESS: "Entrega en curso",
  DELIVERED: "Entregado",
  EVIDENCE_PENDING: "Evidencia pendiente",
  EVIDENCE_SUBMITTED: "Evidencia enviada",
  EVIDENCE_APPROVED: "Evidencia aprobada",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export const tripStatusTone: Record<TripStatus, StatusTone> = {
  REQUESTED: "info",
  UNDER_REVIEW: "info",
  INFORMATION_REQUIRED: "warning",
  CONFIRMED: "info",
  SCHEDULED: "info",
  ASSIGNED: "progress",
  DRIVER_CONFIRMED: "progress",
  EN_ROUTE_TO_ORIGIN: "progress",
  ARRIVED_AT_ORIGIN: "progress",
  WAITING_AT_ORIGIN: "warning",
  LOADING_OR_PICKUP: "progress",
  IN_TRANSIT: "progress",
  ARRIVED_AT_DESTINATION: "progress",
  DELIVERY_IN_PROGRESS: "progress",
  DELIVERED: "success",
  EVIDENCE_PENDING: "warning",
  EVIDENCE_SUBMITTED: "warning",
  EVIDENCE_APPROVED: "success",
  CLOSED: "success",
  CANCELLED: "danger",
};

export const requestStatusLabel: Record<ServiceRequestStatus, string> = {
  DRAFT: "Borrador",
  REQUESTED: "Solicitada",
  UNDER_REVIEW: "En revision",
  INFORMATION_REQUIRED: "Requiere informacion",
  CONFIRMED: "Confirmada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  CONVERTED: "Convertida en viaje",
};

export const requestStatusTone: Record<ServiceRequestStatus, StatusTone> = {
  DRAFT: "neutral",
  REQUESTED: "info",
  UNDER_REVIEW: "info",
  INFORMATION_REQUIRED: "warning",
  CONFIRMED: "progress",
  REJECTED: "danger",
  CANCELLED: "danger",
  CONVERTED: "success",
};

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  OPEN: "Abierta",
  ACKNOWLEDGED: "Recibida",
  IN_PROGRESS: "En gestion",
  RESOLVED: "Resuelta",
  CLOSED: "Cerrada",
};

export const incidentStatusTone: Record<IncidentStatus, StatusTone> = {
  OPEN: "danger",
  ACKNOWLEDGED: "warning",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export const incidentPriorityLabel: Record<IncidentPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Critica",
};

export const incidentPriorityTone: Record<IncidentPriority, StatusTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

export const proofStatusLabel: Record<ProofStatus, string> = {
  SUBMITTED: "Enviada",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

export const proofStatusTone: Record<ProofStatus, StatusTone> = {
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export const tenantStatusLabel: Record<TenantStatus, string> = {
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  ARCHIVED: "Archivado",
  CANCELLED: "Cancelado",
};

export const tenantStatusTone: Record<TenantStatus, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  ARCHIVED: "neutral",
  CANCELLED: "danger",
};

export const tenantRoleLabel: Record<TenantRole, string> = {
  TENANT_OWNER: "Propietario",
  TENANT_ADMIN: "Administrador",
  OPERATIONS_MANAGER: "Gerente de operaciones",
  DISPATCHER: "Despachador",
  SAFETY_MANAGER: "Gerente de seguridad",
  DRIVER: "Conductor",
};

export const customerRoleLabel: Record<CustomerRole, string> = {
  CUSTOMER_ADMIN: "Administrador de cuenta",
  CUSTOMER_VIEWER: "Consulta",
};

export const notificationChannelLabel: Record<NotificationChannel, string> = {
  PORTAL: "Portal",
  EMAIL: "Correo",
  MOCK_WHATSAPP: "WhatsApp demo",
};

export const priorityLabel: Record<"NORMAL" | "URGENT", string> = {
  NORMAL: "Normal",
  URGENT: "Urgente",
};

export const fileStatusLabel: Record<FileStatus, string> = {
  PENDING_UPLOAD: "Subiendo",
  QUARANTINE: "En cuarentena",
  PENDING_SCAN: "Esperando escaneo",
  SCANNING: "Escaneando",
  CLEAN: "Limpio",
  INFECTED: "Infectado",
  AVAILABLE: "Disponible",
  REJECTED: "Rechazado",
};

export const fileStatusTone: Record<FileStatus, StatusTone> = {
  PENDING_UPLOAD: "info",
  QUARANTINE: "warning",
  PENDING_SCAN: "warning",
  SCANNING: "info",
  CLEAN: "success",
  INFECTED: "danger",
  AVAILABLE: "success",
  REJECTED: "danger",
};
