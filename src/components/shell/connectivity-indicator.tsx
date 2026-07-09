"use client";

import { useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Indicador real de conectividad del navegador (navigator.onLine).
 * No simula GPS ni sincronización: solo informa el estado de red actual.
 */
export function ConnectivityIndicator({ className }: { className?: string }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        online ? "bg-success-soft text-success-strong" : "bg-danger-soft text-danger-strong",
        className,
      )}
    >
      {online ? <Wifi aria-hidden className="size-3.5" /> : <WifiOff aria-hidden className="size-3.5" />}
      <span aria-hidden className={cn("size-1.5 rounded-full", online ? "anim-live-dot bg-success" : "bg-danger")} />
      {online ? "En linea" : "Sin conexion"}
    </span>
  );
}
