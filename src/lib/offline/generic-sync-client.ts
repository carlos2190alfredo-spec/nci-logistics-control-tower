"use client";

import {
  SYNC_ACTION_SCHEMA_VERSION,
  type SyncActionResponse,
} from "@/lib/offline/generic-protocol";
import type { SyncLocalRecord } from "@/lib/offline/generic-db";
import {
  applyServerResult,
  listOwnerActions,
  markLocalError,
  markSyncing,
  type SyncOwner,
} from "@/lib/offline/generic-queue";

const MAX_BATCH = 20;

export type GenericSyncOutcome = {
  attempted: number;
  synced: number;
  rejected: number;
  retryable: number;
  unauthenticated: boolean;
  rateLimited: boolean;
};

function readyForSync(record: SyncLocalRecord): boolean {
  if (record.status === "SYNCED" || record.status === "DISCARDED" || record.status === "REJECTED") {
    return false;
  }
  if (record.status === "SYNCING") return true;
  if (record.status === "RETRYABLE_ERROR") {
    return !record.nextRetryAt || record.nextRetryAt <= Date.now();
  }
  return record.status === "PENDING";
}

/**
 * Ejecuta una pasada de sincronización de la cola genérica.
 * Nunca lanza — errores quedan reflejados en el record local.
 */
export async function synchronizeGenericQueue(owner: SyncOwner): Promise<GenericSyncOutcome> {
  const outcome: GenericSyncOutcome = {
    attempted: 0,
    synced: 0,
    rejected: 0,
    retryable: 0,
    unauthenticated: false,
    rateLimited: false,
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) return outcome;

  const all = await listOwnerActions(owner);
  const eligible = all.filter(readyForSync).slice(0, MAX_BATCH);
  if (eligible.length === 0) return outcome;

  outcome.attempted = eligible.length;
  await Promise.all(eligible.map((r) => markSyncing(r)));

  let response: Response;
  try {
    response = await fetch(`/api/sync/actions`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        schemaVersion: SYNC_ACTION_SCHEMA_VERSION,
        actions: eligible.map((r) => r.action),
      }),
    });
  } catch {
    await Promise.all(eligible.map((r) => markLocalError(r, "NETWORK_ERROR")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (response.status === 401 || response.status === 403) {
    outcome.unauthenticated = true;
    await Promise.all(eligible.map((r) => markLocalError(r, "SESSION_EXPIRED")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (response.status === 429) {
    outcome.rateLimited = true;
    await Promise.all(eligible.map((r) => markLocalError(r, "RATE_LIMITED")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (!response.ok) {
    await Promise.all(eligible.map((r) => markLocalError(r, `HTTP_${response.status}`)));
    outcome.retryable = eligible.length;
    return outcome;
  }

  let body: SyncActionResponse;
  try {
    body = (await response.json()) as SyncActionResponse;
  } catch {
    await Promise.all(eligible.map((r) => markLocalError(r, "BAD_RESPONSE")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  const byKey = new Map(body.results.map((r) => [r.idempotencyKey, r] as const));

  for (const record of eligible) {
    const action = record.action as { idempotencyKey: string };
    const result = byKey.get(action.idempotencyKey);
    if (!result) {
      await markLocalError(record, "MISSING_RESULT");
      outcome.retryable += 1;
      continue;
    }
    await applyServerResult(record, result);
    switch (result.status) {
      case "ACCEPTED":
      case "DUPLICATE":
        outcome.synced += 1;
        break;
      case "REJECTED":
      case "UNAUTHORIZED":
        outcome.rejected += 1;
        break;
      case "FAILED":
      case "RETRYABLE":
        outcome.retryable += 1;
        break;
    }
  }

  return outcome;
}
