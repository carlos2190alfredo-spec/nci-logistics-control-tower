"use client";

import {
  computeSyncOwnerKey,
  listSyncRecordsForOwner,
  nextSyncSequence,
  purgeSyncOwner,
  purgeSyncedOlderThan,
  putSyncRecord,
  updateSyncRecord,
  type SyncLocalRecord,
  type SyncLocalStatus,
} from "@/lib/offline/generic-db";
import {
  SYNC_ACTION_SCHEMA_VERSION,
  type SyncActionResult,
} from "@/lib/offline/generic-protocol";

export type SyncOwner = { userId: string; tenantId: string; tenantSlug: string };

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const rnd = Math.random().toString(16).slice(2);
  return `${Date.now().toString(16)}-${rnd}`;
}

export type EnqueueOptions = {
  owner: SyncOwner;
  actionId: string;
  formData: Record<string, string>;
  label?: string;
};

/** Encola una acción genérica. Retorna el record persistido. */
export async function enqueueSyncAction(opts: EnqueueOptions): Promise<SyncLocalRecord> {
  const ownerKey = computeSyncOwnerKey(opts.owner);
  const localSequence = await nextSyncSequence(ownerKey);
  const now = Date.now();
  const record: SyncLocalRecord = {
    localId: generateId(),
    ownerKey,
    tenantSlug: opts.owner.tenantSlug,
    actionId: opts.actionId,
    status: "PENDING",
    attempts: 0,
    createdAt: now,
    queuedAt: now,
    localSequence,
    action: {
      schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
      idempotencyKey: generateId(),
      clientQueuedAt: new Date(now).toISOString(),
      localSequence,
      tenantSlug: opts.owner.tenantSlug,
      actionId: opts.actionId,
      formData: opts.formData,
    },
    label: opts.label,
  };
  await putSyncRecord(record);
  return record;
}

export async function listOwnerActions(owner: SyncOwner): Promise<SyncLocalRecord[]> {
  return listSyncRecordsForOwner(computeSyncOwnerKey(owner));
}

const BACKOFF_STEPS_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

export function computeNextRetry(attempts: number): number {
  const base = BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)];
  const jitter = Math.floor(Math.random() * 1500);
  return Date.now() + base + jitter;
}

export async function markSyncing(record: SyncLocalRecord) {
  await updateSyncRecord(record.localId, { status: "SYNCING", lastAttemptAt: Date.now() });
}

export async function markLocalError(record: SyncLocalRecord, errorCode: string) {
  await updateSyncRecord(record.localId, {
    status: "RETRYABLE_ERROR",
    attempts: record.attempts + 1,
    lastAttemptAt: Date.now(),
    nextRetryAt: computeNextRetry(record.attempts),
    lastErrorCode: errorCode,
  });
}

export async function applyServerResult(record: SyncLocalRecord, result: SyncActionResult) {
  let status: SyncLocalStatus;
  switch (result.status) {
    case "ACCEPTED":
    case "DUPLICATE":
      status = "SYNCED";
      break;
    case "REJECTED":
    case "UNAUTHORIZED":
      status = "REJECTED";
      break;
    case "RETRYABLE":
    case "FAILED":
      status = "RETRYABLE_ERROR";
      break;
    default:
      status = "RETRYABLE_ERROR";
  }
  await updateSyncRecord(record.localId, {
    status,
    attempts: record.attempts + 1,
    lastAttemptAt: Date.now(),
    nextRetryAt: status === "RETRYABLE_ERROR" ? computeNextRetry(record.attempts) : undefined,
    lastErrorCode: result.errorCode,
    serverEntityId: result.serverEntityId,
    serverTimestamp: result.serverTimestamp,
  });
}

export async function discardAction(record: SyncLocalRecord) {
  await updateSyncRecord(record.localId, { status: "DISCARDED" });
}

export async function safeCleanupOnLogout(owner: SyncOwner): Promise<number> {
  const ownerKey = computeSyncOwnerKey(owner);
  const all = await listSyncRecordsForOwner(ownerKey);
  const pending = all.filter((r) => ["PENDING", "SYNCING", "RETRYABLE_ERROR"].includes(r.status));
  if (pending.length > 0) return pending.length;
  await purgeSyncOwner(ownerKey);
  return 0;
}

export async function periodicCleanup(owner: SyncOwner) {
  await purgeSyncedOlderThan(computeSyncOwnerKey(owner), 24 * 60 * 60 * 1000);
}
