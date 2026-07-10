import { createHash } from "node:crypto";
import type { OfflineCommandStatus, Prisma, TenantRole, TripStatus } from "@/generated/prisma";
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

async function persistReceipt(
  tx: Prisma.TransactionClient,
  ctx: SyncContext,
  command: OfflineCommand,
  status: OfflineCommandStatus,
  payloadHash: string,
  input: { tripId?: string; resultEntityId?: string; errorCode?: string },
) {
  await tx.offlineCommandReceipt.upsert({
    where: {
      tenantId_userId_idempotencyKey: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        idempotencyKey: command.idempotencyKey,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      driverId: ctx.driverId,
      tripId: input.tripId,
      idempotencyKey: command.idempotencyKey,
      actionType: command.payload.actionType,
      payloadHash,
      status,
      resultEntityId: input.resultEntityId,
      errorCode: input.errorCode,
      clientQueuedAt: new Date(command.clientQueuedAt),
      expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    update: {},
  });
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
    return reject(command, ErrorCodes.ASSIGNMENT_CHANGED, false, {
      currentServerState: trip.status,
    });
  }
  if (["CLOSED", "CANCELLED"].includes(trip.status)) {
    return reject(command, ErrorCodes.STATE_CONFLICT, false, { currentServerState: trip.status });
  }

  if (trip.status === nextStatus) {
    // Idempotencia natural: el estado deseado ya se alcanzó — DUPLICATE.
    await getDb().$transaction(async (tx) => {
      await persistReceipt(tx, ctx, command, "DUPLICATE", payloadHash, { tripId, resultEntityId: trip.id });
    });
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
    await getDb().$transaction(async (tx) => {
      await persistReceipt(tx, ctx, command, "CONFLICT", payloadHash, { tripId, errorCode: ErrorCodes.STATE_CONFLICT });
    });
    return reject(command, ErrorCodes.STATE_CONFLICT, false, {
      currentServerState: trip.status,
      nextAllowedActions: nextStatuses(trip.status, ctx.role),
    });
  }

  const eventId = await db.$transaction(async (tx) => {
    const updated = await tx.trip.update({
      where: { id: trip.id },
      data: {
        status: nextStatus,
        customerVisibleStatus: customerVisibleStatus[nextStatus],
        simulationStartedAt: nextStatus === "EN_ROUTE_TO_ORIGIN" ? new Date() : undefined,
      },
    });
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
    await persistReceipt(tx, ctx, command, "ACCEPTED", payloadHash, {
      tripId,
      resultEntityId: event.id,
    });
    void updated;
    return event.id;
  });

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
    return reject(command, ErrorCodes.ASSIGNMENT_CHANGED, false, { currentServerState: trip.status });
  }
  if (["CLOSED", "CANCELLED"].includes(trip.status)) {
    return reject(command, ErrorCodes.STATE_CONFLICT, false, { currentServerState: trip.status });
  }

  const incidentId = await db.$transaction(async (tx) => {
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
    await persistReceipt(tx, ctx, command, "ACCEPTED", payloadHash, {
      tripId,
      resultEntityId: incident.id,
    });
    return incident.id;
  });

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
