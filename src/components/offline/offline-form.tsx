"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useGenericOffline } from "@/components/offline/generic-offline-provider";
import { formDataToRecord } from "@/lib/offline/generic-protocol";

type OfflineFormProps = {
  /** El actionId debe existir en SYNC_ACTION_REGISTRY (server). */
  actionId: string;
  /** Server action normal — se ejecuta cuando hay conexión. */
  action: (formData: FormData) => Promise<unknown> | unknown;
  /** Etiqueta corta para el badge (ej. "Crear conductor"). */
  offlineLabel?: string;
  /** Texto opcional cuando se guarda offline. */
  offlineToast?: string;
  className?: string;
  children: ReactNode;
  onOfflineQueued?: () => void;
};

/**
 * Wrapper de `<form>` que:
 * - Si `navigator.onLine`, envía normalmente al server action.
 * - Si NO, previene el submit, serializa el FormData en el protocolo genérico
 *   y lo encola en IndexedDB para sincronización posterior.
 *
 * Requiere `<GenericOfflineProvider>` como ancestro.
 */
export function OfflineForm({
  actionId,
  action,
  offlineLabel,
  offlineToast,
  className,
  children,
  onOfflineQueued,
}: OfflineFormProps) {
  const { enqueue, online } = useGenericOffline();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [status, setStatus] = useState<"idle" | "queued">("idle");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    // Si el browser está online, dejamos que el submit siga su curso normal.
    // El server action puede fallar por otras razones y ese caso lo maneja
    // el propio form action de React.
    if (online && typeof navigator !== "undefined" && navigator.onLine) {
      return;
    }

    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const record = formDataToRecord(fd);
    await enqueue({
      actionId,
      formData: record,
      label: offlineLabel ?? actionId,
    });
    setStatus("queued");
    onOfflineQueued?.();
    // Reset del form para dar señal visual de captura.
    form.reset();
    // Auto-limpia el aviso a los 3s.
    window.setTimeout(() => setStatus("idle"), 3_000);
  };

  return (
    <form action={action as (fd: FormData) => Promise<void>} className={className} onSubmit={handleSubmit} ref={formRef}>
      {children}
      {status === "queued" ? (
        <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-foreground" role="status">
          {offlineToast ?? "Guardado localmente. Se enviara automaticamente al recuperar conexion."}
        </p>
      ) : null}
    </form>
  );
}
