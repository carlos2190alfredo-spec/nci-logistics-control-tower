"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { LocalCommandRecord } from "@/lib/offline/db";
import { enqueueCommand, type QueueOwner } from "@/lib/offline/queue";
import { synchronizeOwner, type SyncOutcome } from "@/lib/offline/sync-client";
import {
  clearOwner,
  getServerSnapshot,
  getSnapshot,
  initOwner,
  requestRefresh,
  subscribeStore,
} from "@/lib/offline/store";
import type { OfflineCommandPayload } from "@/lib/offline/protocol";

export function useOfflineQueue(owner: QueueOwner) {
  const stableOwner = useMemo(
    () => ({ userId: owner.userId, tenantId: owner.tenantId, tenantSlug: owner.tenantSlug, driverId: owner.driverId }),
    [owner.userId, owner.tenantId, owner.tenantSlug, owner.driverId],
  );

  useEffect(() => {
    initOwner(stableOwner);
    return () => {
      clearOwner();
    };
  }, [stableOwner]);

  const records = useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot);

  const enqueue = useCallback(
    async (payload: OfflineCommandPayload) => {
      const record = await enqueueCommand(stableOwner, payload);
      requestRefresh();
      return record;
    },
    [stableOwner],
  );

  const sync = useCallback(async (): Promise<SyncOutcome> => {
    const outcome = await synchronizeOwner(stableOwner);
    requestRefresh();
    return outcome;
  }, [stableOwner]);

  const pending = useMemo(
    () => records.filter((record: LocalCommandRecord) => record.status === "PENDING" || record.status === "SYNCING"),
    [records],
  );
  const retryable = useMemo(
    () => records.filter((record: LocalCommandRecord) => record.status === "RETRYABLE_ERROR"),
    [records],
  );
  const conflicts = useMemo(
    () => records.filter((record: LocalCommandRecord) => record.status === "CONFLICT"),
    [records],
  );
  const rejected = useMemo(
    () => records.filter((record: LocalCommandRecord) => record.status === "REJECTED"),
    [records],
  );

  return { records, pending, retryable, conflicts, rejected, enqueue, sync, refresh: requestRefresh };
}
