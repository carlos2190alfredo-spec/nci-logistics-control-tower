"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useOfflineQueue } from "@/lib/offline/hooks";
import { periodicCleanup } from "@/lib/offline/queue";
import type { QueueOwner } from "@/lib/offline/queue";
import type { OfflineCommandPayload } from "@/lib/offline/protocol";
import { runPhotoSyncCycle } from "@/lib/offline/photo-sync-engine";

export type PhotoSyncState = {
  syncing: boolean;
  lastResult: { uploaded: number; failed: number; pending: number } | null;
};

type OfflineContextValue = ReturnType<typeof useOfflineQueue> & {
  photoSync: PhotoSyncState;
  syncPhotos: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * Provider por conductor. Se monta en la ruta del driver y mantiene:
 * - snapshot reactivo de la cola por owner (aislada por sesión).
 * - reintento automático al recuperar conectividad y cada 45 s.
 * - sincronización de fotos offline cada 30 s.
 * - limpieza periódica de comandos SYNCED antiguos.
 */
export function OfflineProvider({ owner, children }: { owner: QueueOwner; children: ReactNode }) {
  const queue = useOfflineQueue(owner);
  const sync = queue.sync;

  const [photoSync, setPhotoSync] = useState<PhotoSyncState>({ syncing: false, lastResult: null });
  const photoSyncRunning = useRef(false);

  const syncPhotos = useCallback(async () => {
    if (photoSyncRunning.current) return;
    photoSyncRunning.current = true;
    setPhotoSync((prev) => ({ ...prev, syncing: true }));

    try {
      const result = await runPhotoSyncCycle(owner);
      setPhotoSync({ syncing: false, lastResult: result });
    } catch {
      setPhotoSync((prev) => ({ ...prev, syncing: false }));
    } finally {
      photoSyncRunning.current = false;
    }
  }, [owner]);

  useEffect(() => {
    const trigger = () => {
      void sync();
      void syncPhotos();
    };
    const onOnline = () => trigger();
    window.addEventListener("online", onOnline);
    trigger();
    const interval = window.setInterval(trigger, 45_000);
    const photoInterval = window.setInterval(() => { void syncPhotos(); }, 30_000);
    const cleanupInterval = window.setInterval(() => {
      void periodicCleanup(owner);
    }, 5 * 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      window.clearInterval(photoInterval);
      window.clearInterval(cleanupInterval);
    };
  }, [owner, sync, syncPhotos]);

  const value: OfflineContextValue = { ...queue, photoSync, syncPhotos };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
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
