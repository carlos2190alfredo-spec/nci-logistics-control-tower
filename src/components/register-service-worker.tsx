"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

export function RegisterServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => undefined);

    // Only reload on controller change during updates (not first install).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      const dismissed = sessionStorage.getItem("pwa-install-dismissed");
      if (!dismissed) setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setUpdateAvailable(false);
  }, [waitingWorker]);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setShowInstallBanner(false);
    setInstallPrompt(null);
  }, [installPrompt]);

  const dismissInstall = useCallback(() => {
    setShowInstallBanner(false);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  }, []);

  return (
    <>
      {updateAvailable && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm">
          <div className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white shadow-lg">
            <RefreshCw aria-hidden className="size-5 shrink-0" />
            <p className="flex-1 text-sm font-semibold">Nueva version disponible</p>
            <button
              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/30"
              onClick={applyUpdate}
              type="button"
            >
              Actualizar
            </button>
          </div>
        </div>
      )}

      {showInstallBanner && !updateAvailable && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm">
          <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-lg ring-1 ring-border">
            <Download aria-hidden className="size-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm font-semibold text-foreground">Instalar aplicacion</p>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary/90"
              onClick={handleInstall}
              type="button"
            >
              Instalar
            </button>
            <button
              aria-label="Cerrar"
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={dismissInstall}
              type="button"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}
