"use client";

import { OFFLINE_SCHEMA_VERSION, type OfflineSyncResponse } from "@/lib/offline/protocol";
import type { LocalCommandRecord } from "@/lib/offline/db";
import { applyServerResult, listOwnerCommands, markLocalError, markSyncing, type QueueOwner } from "@/lib/offline/queue";

const MAX_BATCH = 20;

export type SyncOutcome = {
  attempted: number;
  synced: number;
  conflicts: number;
  rejected: number;
  retryable: number;
  unauthenticated: boolean;
  rateLimited: boolean;
};

function readyForSync(record: LocalCommandRecord): boolean {
  if (record.status === "SYNCED" || record.status === "DISCARDED" || record.status === "REJECTED" || record.status === "CONFLICT") {
    return false;
  }
  if (record.status === "SYNCING") return true;
  if (record.status === "RETRYABLE_ERROR") {
    return !record.nextRetryAt || record.nextRetryAt <= Date.now();
  }
  return record.status === "PENDING";
}

/**
 * Ejecuta una pasada de sincronización con el servidor. Solo trata comandos
 * elegibles (PENDING o RETRYABLE_ERROR con `nextRetryAt` cumplido). Nunca
 * lanza excepciones al llamador — todo error se refleja en el record local.
 */
export async function synchronizeOwner(owner: QueueOwner): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    attempted: 0,
    synced: 0,
    conflicts: 0,
    rejected: 0,
    retryable: 0,
    unauthenticated: false,
    rateLimited: false,
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return outcome;
  }

  const all = await listOwnerCommands(owner);
  const eligible = all.filter(readyForSync).slice(0, MAX_BATCH);
  if (eligible.length === 0) return outcome;

  outcome.attempted = eligible.length;
  await Promise.all(eligible.map((record) => markSyncing(record)));

  let response: Response;
  try {
    response = await fetch(`/api/t/${owner.tenantSlug}/driver/sync`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        schemaVersion: OFFLINE_SCHEMA_VERSION,
        commands: eligible.map((record) => record.command),
      }),
    });
  } catch {
    // Red caída o CORS: cada comando queda como retryable.
    await Promise.all(eligible.map((record) => markLocalError(record, "NETWORK_ERROR")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (response.status === 401 || response.status === 403) {
    outcome.unauthenticated = true;
    await Promise.all(eligible.map((record) => markLocalError(record, "SESSION_EXPIRED")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (response.status === 429) {
    outcome.rateLimited = true;
    await Promise.all(eligible.map((record) => markLocalError(record, "RATE_LIMITED")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  if (!response.ok) {
    await Promise.all(eligible.map((record) => markLocalError(record, `HTTP_${response.status}`)));
    outcome.retryable = eligible.length;
    return outcome;
  }

  let body: OfflineSyncResponse;
  try {
    body = (await response.json()) as OfflineSyncResponse;
  } catch {
    await Promise.all(eligible.map((record) => markLocalError(record, "BAD_RESPONSE")));
    outcome.retryable = eligible.length;
    return outcome;
  }

  const byKey = new Map(body.results.map((result) => [result.idempotencyKey, result] as const));

  for (const record of eligible) {
    const command = record.command as { idempotencyKey: string };
    const result = byKey.get(command.idempotencyKey);
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
      case "CONFLICT":
        outcome.conflicts += 1;
        break;
      case "REJECTED":
      case "FAILED":
        outcome.rejected += 1;
        break;
      case "RETRYABLE":
        outcome.retryable += 1;
        break;
    }
  }

  return outcome;
}
