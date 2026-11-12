import { createHash } from "node:crypto";
import type { TenantRole, TripStatus } from "@/generated/prisma";
import { canTransition, customerVisibleStatus, nextStatuses } from "@/lib/domain/state-machine";
import { audit } from "@/lib/server/audit";
import { getDb } from "@/lib/server/db";
import { ErrorCodes, type ErrorCode } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { sendLocalNotification } from "@/lib/providers/notifications";
import {
  canonicalizePayload,
  DRIVER_ALLOWED_TRANSITIONS,
  type OfflineCommand,
  type OfflineCommandResult,
} from "@/lib/offline/protocol";

const RECEIPT_TTL_DAYS = 30;

type SyncContext = {
  userId: string;
  userName: string;
  tenantId: string;
  tenantSlug: string;
  driverId: string;
  role: TenantRole;
};

function hashPayload(payload: unknown) {
  return createHash("sha256").update(canonicalizePayload(payload)).digest("hex");
}

function reject(command: OfflineCommand, code: ErrorCode, retryable = false, extra?: Partial<OfflineCommandResult>): OfflineCommandResult {
  return {
    idempotencyKey: command.idempotencyKey,
    status: retryable ? "RETRYABLE" : code === ErrorCodes.STATE_CONFLICT ? "CONFLICT" : "REJECTED",
    serverTimestamp: new Date().toISOString(),
    errorCode: code,
    retryable,
    ...extra,
  };
}

/**
 * Contra race condition: creamos el receipt como PRIMER paso de la transacción
 * con `create` (no `upsert`). Si un segundo request con la misma clave llega
 * antes del commit del primero, su create dispara el UNIQUE
 * (tenant_id, user_id, idempotency_key) y la transacción completa hace rollback
 * ANTES de crear `tripEvent` o mutar `trip`. `err.code === 'P2002'` significa
 * duplicado — devolvemos DUPLICATE con el resultado del receipt existente.
 */
function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

/** El estado del viaje cambio entre la lectura y la escritura. */
class StaleTripStateError extends Error {
  constructor() {
    super("stale_trip_state");
    this.name = "StaleTripStateError";
  }
}

/** Registra un receipt CONFLICT (idempotente: un duplicado se ignora). */
async function recordConflictReceipt(ctx: SyncContext, command: OfflineCommand, tripId: string, payloadHash: string) {
  try {
    await getDb().offlineCommandReceipt.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        driverId: ctx.driverId,
        tripId,
        idempotencyKey: command.idempotencyKey,
        actionType: command.payload.actionType,
        payloadHash,
        status: "CONFLICT",
        errorCode: ErrorCodes.STATE_CONFLICT,
        clientQueuedAt: new Date(command.clientQueuedAt),
        expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    if (!isPrismaUniqueViolation(error)) throw error;
  }
}

async function processTransition(ctx: SyncContext, command: OfflineCommand): Promise<OfflineCommandResult> {
  if (command.payload.actionType !== "trip.transition") throw new Error("wrong action");
  const { tripId, nextStatus, note } = command.payload;
  const payloadHash = hashPayload(command.payload);

  if (!DRIVER_ALLOWED_TRANSITIONS.includes(nextStatus)) {
    return reject(command, ErrorCodes.SYNC_REJECTED);
  }

  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: ctx.tenantId },
    select: { id: true, status: true, driverId: true, reference: true, customerAccountId: true, tenantId: true },
  });
  if (!trip) return reject(command, ErrorCodes.RESOURCE_NOT_FOUND);
  if (trip.driverId !== ctx.driverId) {
    // No filtramos currentServerState para no permitir enumeracion cross-driver.
    return reject(command, ErrorCodes.ASSIGNMENT_CHANGED);
  }
  if (["CLOSED", "CANCELLED"].includes(trip.status)) {
    return reject(command, ErrorCodes.STATE_CONFLICT, false, { currentServerState: trip.status });
  }

  if (trip.status === nextStatus) {
    try {
      await db.$transaction(async (tx) => {
        await tx.offlineCommandReceipt.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            driverId: ctx.driverId,
            tripId,
            idempotencyKey: command.idempotencyKey,
            actionType: command.payload.actionType,
            payloadHash,
            status: "DUPLICATE",
            resultEntityId: trip.id,
            clientQueuedAt: new Date(command.clientQueuedAt),
            expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) throw error;
    }
    return {
      idempotencyKey: command.idempotencyKey,
      status: "DUPLICATE",
      serverTimestamp: new Date().toISOString(),
      currentServerState: trip.status,
      nextAllowedActions: nextStatuses(trip.status, ctx.role),
      retryable: false,
    };
  }

  if (!canTransition(trip.status, nextStatus, ctx.role)) {
    await recordConflictReceipt(ctx, command, tripId, payloadHash);
    return reject(command, ErrorCodes.STATE_CONFLICT, false, {
      currentServerState: trip.status,
      nextAllowedActions: nextStatuses(trip.status, ctx.role),
    });
  }

  let eventId: string;
  try {
    eventId = await db.$transaction(async (tx) => {
      // 1. Receipt PRIMERO: si otra tx ya lo creo, el UNIQUE aborta antes de mutar.
      const receipt = await tx.offlineCommandReceipt.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          driverId: ctx.driverId,
          tripId,
          idempotencyKey: command.idempotencyKey,
          actionType: command.payload.actionType,
          payloadHash,
          status: "ACCEPTED",
          clientQueuedAt: new Date(command.clientQueuedAt),
          expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      // 2. Mutaciones dentro del mismo commit atomico. Bloqueo optimista: si
      //    operaciones cambio el estado o reasigno el viaje desde la lectura,
      //    el update afecta 0 filas y toda la transaccion (receipt incluido)
      //    hace rollback.
      const moved = await tx.trip.updateMany({
        where: { id: trip.id, tenantId: ctx.tenantId, status: trip.status, driverId: ctx.driverId },
        data: {
          status: nextStatus,
          customerVisibleStatus: customerVisibleStatus[nextStatus],
          simulationStartedAt: nextStatus === "EN_ROUTE_TO_ORIGIN" ? new Date() : undefined,
        },
      });
      if (moved.count === 0) throw new StaleTripStateError();
      const event = await tx.tripEvent.create({
        data: {
          tenantId: ctx.tenantId,
          tripId: trip.id,
          actorId: ctx.userId,
          fromStatus: trip.status,
          toStatus: nextStatus,
          note: note ?? "Accion registrada por conductor (offline sync).",
          visibleToCustomer: true,
        },
      });
      await tx.offlineCommandReceipt.update({
        where: { id: receipt.id },
        data: { resultEntityId: event.id },
      });
      return event.id;
    });
  } catch (error) {
    if (error instanceof StaleTripStateError) {
      const current = await db.trip.findFirst({
        where: { id: trip.id, tenantId: ctx.tenantId },
        select: { status: true, driverId: true },
      });
      if (!current || current.driverId !== ctx.driverId) {
        return reject(command, ErrorCodes.ASSIGNMENT_CHANGED);
      }
      await recordConflictReceipt(ctx, command, tripId, payloadHash);
      return reject(command, ErrorCodes.STATE_CONFLICT, false, {
        currentServerState: current.status,
        nextAllowedActions: nextStatuses(current.status, ctx.role),
      });
    }
    if (isPrismaUniqueViolation(error)) {
      // Otro request con misma idempotencyKey gano la carrera. Devolvemos su resultado.
      const existing = await db.offlineCommandReceipt.findUnique({
        where: {
          tenantId_userId_idempotencyKey: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            idempotencyKey: command.idempotencyKey,
          },
        },
      });
      return {
        idempotencyKey: command.idempotencyKey,
        status: "DUPLICATE",
        serverEventId: existing?.resultEntityId ?? undefined,
        serverTimestamp: (existing?.processedAt ?? new Date()).toISOString(),
        currentServerState: nextStatus,
        nextAllowedActions: nextStatuses(nextStatus, ctx.role),
        retryable: false,
      };
    }
    throw error;
  }

  await audit({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "offline.trip.transition",
    entity: "Trip",
    entityId: trip.id,
    before: { status: trip.status },
    after: { status: nextStatus, idempotencyKey: command.idempotencyKey },
  });

  return {
    idempotencyKey: command.idempotencyKey,
    status: "ACCEPTED",
    serverEventId: eventId,
    serverTimestamp: new Date().toISOString(),
    currentServerState: nextStatus,
    nextAllowedActions: nextStatuses(nextStatus, ctx.role),
    retryable: false,
  };
}

async function processIncident(ctx: SyncContext, command: OfflineCommand): Promise<OfflineCommandResult> {
  if (command.payload.actionType !== "trip.incident") throw new Error("wrong action");
  const { tripId, category, internalDescription, customerMessage } = command.payload;
  const payloadHash = hashPayload(command.payload);

  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: ctx.tenantId },
    select: { id: true, driverId: true, tenantId: true, customerAccountId: true, reference: true, status: true },
  });
  if (!trip) return reject(command, ErrorCodes.RESOURCE_NOT_FOUND);
  if (trip.driverId !== ctx.driverId) {
    return reject(command, ErrorCodes.ASSIGNMENT_CHANGED);
  }
  if (["CLOSED", "CANCELLED"].includes(trip.status)) {
    return reject(command, ErrorCodes.STATE_CONFLICT, false, { currentServerState: trip.status });
  }

  let incidentId: string;
  try {
    incidentId = await db.$transaction(async (tx) => {
      const receipt = await tx.offlineCommandReceipt.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          driverId: ctx.driverId,
          tripId,
          idempotencyKey: command.idempotencyKey,
          actionType: command.payload.actionType,
          payloadHash,
          status: "ACCEPTED",
          clientQueuedAt: new Date(command.clientQueuedAt),
          expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      const incident = await tx.incident.create({
        data: {
          tenantId: ctx.tenantId,
          customerAccountId: trip.customerAccountId,
          tripId: trip.id,
          category,
          priority: "MEDIUM",
          internalDescription,
          customerMessage: customerMessage ?? null,
          visibleToCustomer: Boolean(customerMessage),
        },
      });
      await tx.offlineCommandReceipt.update({
        where: { id: receipt.id },
        data: { resultEntityId: incident.id },
      });
      return incident.id;
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const existing = await db.offlineCommandReceipt.findUnique({
        where: {
          tenantId_userId_idempotencyKey: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            idempotencyKey: command.idempotencyKey,
          },
        },
      });
      return {
        idempotencyKey: command.idempotencyKey,
        status: "DUPLICATE",
        serverEventId: existing?.resultEntityId ?? undefined,
        serverTimestamp: (existing?.processedAt ?? new Date()).toISOString(),
        currentServerState: trip.status,
        retryable: false,
      };
    }
    throw error;
  }

  await sendLocalNotification({
    tenantId: ctx.tenantId,
    customerAccountId: trip.customerAccountId,
    channel: "PORTAL",
    recipient: "operations",
    subject: `Incidencia offline ${trip.reference}`,
    body: `Conductor reporto incidencia sincronizada offline: ${category}.`,
  });

  await audit({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "offline.trip.incident",
    entity: "Incident",
    entityId: incidentId,
    after: { idempotencyKey: command.idempotencyKey, category },
  });

  return {
    idempotencyKey: command.idempotencyKey,
    status: "ACCEPTED",
    serverEventId: incidentId,
    serverTimestamp: new Date().toISOString(),
    currentServerState: trip.status,
    retryable: false,
  };
}

/**
 * Procesa un lote de comandos offline reautenticados por sesión.
 * - Idempotencia: unicidad (tenant, user, idempotencyKey) en DB.
 * - Detección de manipulación: si la misma clave llega con payload_hash distinto,
 *   se responde PAYLOAD_TAMPERED sin ejecutar.
 * - Un comando fallido NO aborta el lote.
 */
export async function processOfflineBatch(ctx: SyncContext, commands: OfflineCommand[]): Promise<OfflineCommandResult[]> {
  const results: OfflineCommandResult[] = [];
  // Comandos de un mismo viaje se procesan en el orden de `localSequence`.
  const ordered = [...commands].sort((a, b) => a.localSequence - b.localSequence);

  for (const command of ordered) {
    const payloadHash = hashPayload(command.payload);
    try {
      const existing = await getDb().offlineCommandReceipt.findUnique({
        where: {
          tenantId_userId_idempotencyKey: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            idempotencyKey: command.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          await audit({
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            actorRole: ctx.role,
            action: "offline.payload_tampered",
            entity: "OfflineCommandReceipt",
            entityId: existing.id,
            before: { previousHash: existing.payloadHash },
            after: { attemptedHash: payloadHash, actionType: command.payload.actionType },
          });
          results.push({
            idempotencyKey: command.idempotencyKey,
            status: "REJECTED",
            errorCode: ErrorCodes.PAYLOAD_TAMPERED,
            serverTimestamp: new Date().toISOString(),
            retryable: false,
          });
          continue;
        }

        const status: OfflineCommandResult["status"] =
          existing.status === "ACCEPTED"
            ? "DUPLICATE"
            : (existing.status as OfflineCommandResult["status"]);
        results.push({
          idempotencyKey: command.idempotencyKey,
          status,
          serverEventId: existing.resultEntityId ?? undefined,
          errorCode: existing.errorCode ?? undefined,
          serverTimestamp: existing.processedAt.toISOString(),
          retryable: false,
        });
        continue;
      }

      let result: OfflineCommandResult;
      if (command.payload.actionType === "trip.transition") {
        result = await processTransition(ctx, command);
      } else {
        result = await processIncident(ctx, command);
      }
      results.push(result);
    } catch (error) {
      logger.error("offline command failed", {
        idempotencyKey: command.idempotencyKey,
        actionType: command.payload.actionType,
        error: error instanceof Error ? error.message : "unknown",
      });
      results.push({
        idempotencyKey: command.idempotencyKey,
        status: "RETRYABLE",
        errorCode: ErrorCodes.SYNC_RETRYABLE,
        serverTimestamp: new Date().toISOString(),
        retryable: true,
      });
    }
  }

  return results;
}

/** Limpia recibos vencidos: llamado ocasionalmente. */
export async function pruneExpiredReceipts() {
  await getDb().offlineCommandReceipt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export type { TripStatus };
