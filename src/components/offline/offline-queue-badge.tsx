"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOptionalGenericOffline } from "@/components/offline/generic-offline-provider";

/**
 * Badge para el topbar: muestra estado offline y cantidad de acciones pendientes
 * de sincronización. Click → dispara sincronización manual.
 *
 * Si no hay `GenericOfflineProvider` en el árbol (ej. pantallas fuera del tenant
 * layout), simplemente no renderiza — no explota.
 */
export function OfflineQueueBadge() {
  const ctx = useOptionalGenericOffline();
  if (!ctx) return null;
  const { online, syncing, pending, sync } = ctx;

  if (online && pending === 0) return null;

  const label = !online
    ? `Sin conexion${pending > 0 ? ` · ${pending} pendiente${pending === 1 ? "" : "s"}` : ""}`
    : `${pending} accion${pending === 1 ? "" : "es"} por sincronizar`;

  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:bg-warning/20 disabled:opacity-60"
      disabled={syncing}
      onClick={() => void sync()}
      title="Sincronizar ahora"
      type="button"
    >
      {syncing ? (
        <RefreshCw aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <CloudOff aria-hidden className="size-3.5" />
      )}
      <span>{label}</span>
    </button>
  );
}
