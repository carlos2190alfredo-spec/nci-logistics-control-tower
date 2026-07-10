"use client";

import {
  computeOwnerKey,
  getPendingCommandsForOwner,
  nextLocalSequence,
  purgeOwner,
  purgeSyncedOlderThan,
  putCommand,
  removeCommand,
  updateCommand,
  type LocalCommandRecord,
  type LocalCommandStatus,
} from "@/lib/offline/db";
import {
  OFFLINE_SCHEMA_VERSION,
  type OfflineCommandPayload,
  type OfflineCommandResult,
} from "@/lib/offline/protocol";

export type QueueOwner = { userId: string; tenantId: string; tenantSlug: string; driverId: string | null };

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const random = Math.random().toString(16).slice(2);
  return `${Date.now().toString(16)}-${random}`;
}

/** Encola una acción del conductor. Retorna el record persistido. */
export async function enqueueCommand(owner: QueueOwner, payload: OfflineCommandPayload): Promise<LocalCommandRecord> {
  if (!owner.driverId) {
    throw new Error("Solo un conductor asignado puede encolar acciones offline.");
  }
  const ownerKey = computeOwnerKey(owner);
  const localSequence = await nextLocalSequence(ownerKey);
  const now = Date.now();
  const record: LocalCommandRecord = {
    localCommandId: generateId(),
    ownerKey,
    tenantSlug: owner.tenantSlug,
    actionType: payload.actionType,
    status: "PENDING",
    attempts: 0,
    createdAt: now,
    queuedAt: now,
    localSequence,
    command: {
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      idempotencyKey: generateId(),
      clientQueuedAt: new Date(now).toISOString(),
      localSequence,
      payload,
    },
  };
  await putCommand(record);
  return record;
}

export async function listOwnerCommands(owner: QueueOwner): Promise<LocalCommandRecord[]> {
  return getPendingCommandsForOwner(computeOwnerKey(owner));
}

const BACKOFF_STEPS_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

export function computeNextRetry(attempts: number): number {
  const base = BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)];
  const jitter = Math.floor(Math.random() * 1500);
  return Date.now() + base + jitter;
}

export async function markSyncing(record: LocalCommandRecord) {
  await updateCommand(record.localCommandId, { status: "SYNCING", lastAttemptAt: Date.now() });
}

export async function applyServerResult(record: LocalCommandRecord, result: OfflineCommandResult) {
  let status: LocalCommandStatus;
  switch (result.status) {
    case "ACCEPTED":
    case "DUPLICATE":
      status = "SYNCED";
      break;
    case "CONFLICT":
      status = "CONFLICT";
      break;
    case "REJECTED":
      status = "REJECTED";
      break;
    case "RETRYABLE":
    case "FAILED":
      status = "RETRYABLE_ERROR";
      break;
    default:
      status = "RETRYABLE_ERROR";
  }
  await updateCommand(record.localCommandId, {
    status,
    attempts: record.attempts + 1,
    lastAttemptAt: Date.now(),
    nextRetryAt: status === "RETRYABLE_ERROR" ? computeNextRetry(record.attempts) : undefined,
    lastErrorCode: result.errorCode,
    serverEventId: result.serverEventId,
    serverTimestamp: result.serverTimestamp,
  });
}

export async function markLocalError(record: LocalCommandRecord, errorCode: string) {
  await updateCommand(record.localCommandId, {
    status: "RETRYABLE_ERROR",
    attempts: record.attempts + 1,
    lastAttemptAt: Date.now(),
    nextRetryAt: computeNextRetry(record.attempts),
    lastErrorCode: errorCode,
  });
}

export async function discardCommand(record: LocalCommandRecord) {
  await updateCommand(record.localCommandId, { status: "DISCARDED" });
}

/**
 * Limpieza en logout. Si hay pendientes NO limpia — el llamador debe advertir
 * al usuario y decidir explícitamente. Retorna el número de pendientes.
 */
export async function safeCleanupOnLogout(owner: QueueOwner): Promise<number> {
  const ownerKey = computeOwnerKey(owner);
  const all = await getPendingCommandsForOwner(ownerKey);
  const pending = all.filter((record) => ["PENDING", "SYNCING", "RETRYABLE_ERROR", "CONFLICT"].includes(record.status));
  if (pending.length > 0) return pending.length;
  await purgeOwner(ownerKey);
  return 0;
}

/** Purga explícita solicitada por el usuario con confirmación en UI. */
export async function forcePurgeOwner(owner: QueueOwner) {
  await purgeOwner(computeOwnerKey(owner));
}

/** Rutina periódica: elimina SYNCED > 24h. */
export async function periodicCleanup(owner: QueueOwner) {
  await purgeSyncedOlderThan(computeOwnerKey(owner), 24 * 60 * 60 * 1000);
}

export { removeCommand };
