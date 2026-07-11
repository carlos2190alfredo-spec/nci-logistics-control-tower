"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, Camera, CheckCircle2, RefreshCcw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useOfflineContext } from "@/components/offline/offline-provider";
import { cn } from "@/lib/utils";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Barra fija con estado de conectividad y acciones pendientes/conflictos. */
export function SyncStatus({ className }: { className?: string }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const { pending, retryable, conflicts, rejected, sync, syncPhotos, photoSync, records } = useOfflineContext();
  const hasWork = pending.length + retryable.length + conflicts.length + rejected.length > 0;
  const lastSynced = records
    .filter((record) => record.serverTimestamp)
    .map((record) => record.serverTimestamp as string)
    .sort()
    .pop();

  const items: Array<{ label: string; count: number; tone: string; icon: React.ReactNode }> = [];
  if (pending.length) items.push({ label: "Pendientes", count: pending.length, tone: "text-primary-strong bg-primary-soft", icon: <RefreshCcw className="size-3.5" /> });
  if (retryable.length) items.push({ label: "Reintentando", count: retryable.length, tone: "text-warning-strong bg-warning-soft", icon: <RefreshCcw className="size-3.5" /> });
  if (conflicts.length) items.push({ label: "Conflictos", count: conflicts.length, tone: "text-danger-strong bg-danger-soft", icon: <TriangleAlert className="size-3.5" /> });
  if (rejected.length) items.push({ label: "Rechazados", count: rejected.length, tone: "text-danger-strong bg-danger-soft", icon: <AlertTriangle className="size-3.5" /> });

  const photoPending = photoSync.lastResult?.pending ?? 0;
  const photoFailed = photoSync.lastResult?.failed ?? 0;
  if (photoPending > 0) items.push({ label: "Fotos pendientes", count: photoPending, tone: "text-info-strong bg-info-soft", icon: <Camera className="size-3.5" /> });
  if (photoFailed > 0) items.push({ label: "Fotos con error", count: photoFailed, tone: "text-danger-strong bg-danger-soft", icon: <Camera className="size-3.5" /> });

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-3 shadow-xs",
        online ? "border-border" : "border-warning/40",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          online ? "bg-success-soft text-success-strong" : "bg-danger-soft text-danger-strong",
        )}
      >
        {online ? <Wifi aria-hidden className="size-3.5" /> : <WifiOff aria-hidden className="size-3.5" />}
        {online ? "En linea" : "Sin conexion"}
      </span>
      {items.length ? (
        items.map((item) => (
          <span
            key={item.label}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", item.tone)}
          >
            {item.icon}
            {item.label}: <span className="tabular-nums">{item.count}</span>
          </span>
        ))
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-strong">
          <CheckCircle2 aria-hidden className="size-3.5" />
          Sincronizado
        </span>
      )}
      {lastSynced ? (
        <span className="text-[11px] text-faint-foreground">
          Ultima sincronizacion:{" "}
          <time className="tabular-nums" dateTime={lastSynced}>
            {new Date(lastSynced).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" })}
          </time>
        </span>
      ) : null}
      {hasWork || photoPending > 0 || photoFailed > 0 ? (
        <button
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          onClick={() => {
            void sync();
            void syncPhotos();
          }}
          type="button"
        >
          <RefreshCcw aria-hidden className={cn("size-3.5", photoSync.syncing && "animate-spin")} />
          Reintentar sync
        </button>
      ) : null}
    </div>
  );
}
