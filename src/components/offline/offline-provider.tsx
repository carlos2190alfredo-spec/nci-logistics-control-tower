"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useOfflineQueue } from "@/lib/offline/hooks";
import { periodicCleanup } from "@/lib/offline/queue";
import type { QueueOwner } from "@/lib/offline/queue";
import type { OfflineCommandPayload } from "@/lib/offline/protocol";

type OfflineContextValue = ReturnType<typeof useOfflineQueue>;

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * Provider por conductor. Se monta en la ruta del driver y mantiene:
 * - snapshot reactivo de la cola por owner (aislada por sesión).
 * - reintento automático al recuperar conectividad y cada 45 s.
 * - limpieza periódica de comandos SYNCED antiguos.
 */
export function OfflineProvider({ owner, children }: { owner: QueueOwner; children: ReactNode }) {
  const queue = useOfflineQueue(owner);
  const sync = queue.sync;

  useEffect(() => {
    const trigger = () => {
      void sync();
    };
    const onOnline = () => trigger();
    window.addEventListener("online", onOnline);
    trigger();
    const interval = window.setInterval(trigger, 45_000);
    const cleanupInterval = window.setInterval(() => {
      void periodicCleanup(owner);
    }, 5 * 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      window.clearInterval(cleanupInterval);
    };
  }, [owner, sync]);

  return <OfflineContext.Provider value={queue}>{children}</OfflineContext.Provider>;
}

export function useOfflineContext() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOfflineContext debe usarse dentro de OfflineProvider.");
  }
  return context;
}

export function useEnqueueCommand() {
  const { enqueue, sync } = useOfflineContext();
  return useCallback(
    async (payload: OfflineCommandPayload) => {
      const record = await enqueue(payload);
      void sync();
      return record;
    },
    [enqueue, sync],
  );
}
