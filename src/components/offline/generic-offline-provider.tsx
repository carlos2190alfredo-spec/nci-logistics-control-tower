"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  discardAction,
  enqueueSyncAction,
  listOwnerActions,
  periodicCleanup,
  type EnqueueOptions,
  type SyncOwner,
} from "@/lib/offline/generic-queue";
import type { SyncLocalRecord } from "@/lib/offline/generic-db";
import { synchronizeGenericQueue, type GenericSyncOutcome } from "@/lib/offline/generic-sync-client";

type GenericOfflineContextValue = {
  owner: SyncOwner;
  online: boolean;
  syncing: boolean;
  records: SyncLocalRecord[];
  pending: number;
  lastOutcome: GenericSyncOutcome | null;
  enqueue: (opts: Omit<EnqueueOptions, "owner">) => Promise<SyncLocalRecord>;
  sync: () => Promise<void>;
  discard: (record: SyncLocalRecord) => Promise<void>;
  refresh: () => Promise<void>;
};

const GenericOfflineContext = createContext<GenericOfflineContextValue | null>(null);

/**
 * Provider global de la cola offline genérica. Se monta a nivel de tenant
 * layout y mantiene:
 * - snapshot reactivo de la cola por (user, tenant)
 * - reintento automático al recuperar conectividad + cada 45s
 * - limpieza periódica de acciones SYNCED antiguas
 * - detección de `online` / `offline` via `navigator.onLine`
 */
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function GenericOfflineProvider({
  owner,
  children,
}: {
  owner: SyncOwner;
  children: ReactNode;
}) {
  const [records, setRecords] = useState<SyncLocalRecord[]>([]);
  // useSyncExternalStore con snapshot de servidor `true`: durante la hidratacion el
  // cliente usa el mismo valor que el HTML del servidor y luego pasa al real. Leer
  // navigator.onLine en useState producia un mismatch de hidratacion (OfflineQueueBadge).
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [syncing, setSyncing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<GenericSyncOutcome | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const list = await listOwnerActions(owner);
    setRecords(list);
  }, [owner]);

  const enqueue = useCallback<GenericOfflineContextValue["enqueue"]>(
    async (opts) => {
      const record = await enqueueSyncAction({ owner, ...opts });
      await refresh();
      return record;
    },
    [owner, refresh],
  );

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const outcome = await synchronizeGenericQueue(owner);
      setLastOutcome(outcome);
      await refresh();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [owner, refresh]);

  const discard = useCallback<GenericOfflineContextValue["discard"]>(
    async (record) => {
      await discardAction(record);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    // Diferir para evitar setState síncrono desde el effect (React 19 rule).
    const bootstrap = window.setTimeout(() => {
      void refresh();
      void sync();
    }, 0);
    const syncInterval = window.setInterval(() => void sync(), 45_000);
    const cleanupInterval = window.setInterval(() => {
      void periodicCleanup(owner);
    }, 5 * 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearTimeout(bootstrap);
      window.clearInterval(syncInterval);
      window.clearInterval(cleanupInterval);
    };
  }, [owner, refresh, sync]);

  const pending = records.filter(
    (r) => r.status === "PENDING" || r.status === "SYNCING" || r.status === "RETRYABLE_ERROR",
  ).length;

  const value: GenericOfflineContextValue = {
    owner,
    online,
    syncing,
    records,
    pending,
    lastOutcome,
    enqueue,
    sync,
    discard,
    refresh,
  };

  return <GenericOfflineContext.Provider value={value}>{children}</GenericOfflineContext.Provider>;
}

export function useGenericOffline() {
  const ctx = useContext(GenericOfflineContext);
  if (!ctx) {
    throw new Error("useGenericOffline debe usarse dentro de GenericOfflineProvider.");
  }
  return ctx;
}

/** Variante que NO explota si el provider está ausente. Retorna null. */
export function useOptionalGenericOffline() {
  return useContext(GenericOfflineContext);
}
