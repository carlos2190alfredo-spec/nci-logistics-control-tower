import { z } from "zod";
import type { TripStatus } from "@/generated/prisma/enums";

/**
 * Protocolo compartido cliente/servidor para la cola offline.
 * Cambios de estructura DEBEN incrementar OFFLINE_SCHEMA_VERSION.
 */
export const OFFLINE_SCHEMA_VERSION = 1;

/** Acciones que el conductor puede ejecutar offline. */
export const OFFLINE_ACTION_TYPES = ["trip.transition", "trip.incident"] as const;
export type OfflineActionType = (typeof OFFLINE_ACTION_TYPES)[number];

/** Transiciones que el DRIVER puede iniciar. Whitelist server-side. */
export const DRIVER_ALLOWED_TRANSITIONS: readonly TripStatus[] = [
  "DRIVER_CONFIRMED",
  "EN_ROUTE_TO_ORIGIN",
  "ARRIVED_AT_ORIGIN",
  "WAITING_AT_ORIGIN",
  "LOADING_OR_PICKUP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "DELIVERY_IN_PROGRESS",
  "DELIVERED",
  "EVIDENCE_PENDING",
] as const;

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

const transitionPayload = z.object({
  actionType: z.literal("trip.transition"),
  tripId: uuid,
  nextStatus: z.enum(DRIVER_ALLOWED_TRANSITIONS as unknown as [TripStatus, ...TripStatus[]]),
  note: z.string().min(1).max(240).optional(),
});

const incidentPayload = z.object({
  actionType: z.literal("trip.incident"),
  tripId: uuid,
  category: z.string().min(1).max(64),
  internalDescription: z.string().min(1).max(500),
  customerMessage: z.string().min(1).max(500).optional(),
});

export const offlineCommandSchema = z.object({
  schemaVersion: z.literal(OFFLINE_SCHEMA_VERSION),
  idempotencyKey: uuid,
  clientQueuedAt: isoDate,
  localSequence: z.number().int().nonnegative(),
  payload: z.discriminatedUnion("actionType", [transitionPayload, incidentPayload]),
});

export type OfflineCommand = z.infer<typeof offlineCommandSchema>;
export type OfflineCommandPayload = OfflineCommand["payload"];

export const offlineSyncRequestSchema = z.object({
  schemaVersion: z.literal(OFFLINE_SCHEMA_VERSION),
  commands: z.array(offlineCommandSchema).min(1).max(25),
});

export type OfflineSyncRequest = z.infer<typeof offlineSyncRequestSchema>;

/** Códigos de resultado por comando devueltos por el endpoint. */
export const OFFLINE_RESULT_STATUS = [
  "ACCEPTED",
  "DUPLICATE",
  "CONFLICT",
  "REJECTED",
  "FAILED",
  "RETRYABLE",
] as const;
export type OfflineResultStatus = (typeof OFFLINE_RESULT_STATUS)[number];

export type OfflineCommandResult = {
  idempotencyKey: string;
  status: OfflineResultStatus;
  serverEventId?: string;
  serverTimestamp: string;
  errorCode?: string;
  retryable: boolean;
  currentServerState?: TripStatus;
  nextAllowedActions?: TripStatus[];
};

export type OfflineSyncResponse = {
  schemaVersion: number;
  results: OfflineCommandResult[];
};

/**
 * Serializa el payload de forma determinista para hashear (idempotencia).
 * Ordena claves por nombre para que reejecuciones tengan el mismo hash.
 */
export function canonicalizePayload(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = (value as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return value;
  });
}
