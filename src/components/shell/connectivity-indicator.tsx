"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Indicador real de conectividad del navegador (navigator.onLine).
 * No simula GPS ni sincronización: solo informa el estado de red actual.
 */
export function ConnectivityIndicator({ className }: { className?: string }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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
