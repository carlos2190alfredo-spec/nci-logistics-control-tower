"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useOfflineContext } from "@/components/offline/offline-provider";
import { buttonStyles } from "@/components/ui/button-styles";
import { TextArea } from "@/components/ui/field";

export function OfflineIncidentFormClient({ tripId }: { tripId: string }) {
  const router = useRouter();
  const { enqueue, sync } = useOfflineContext();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const internalDescription = String(formData.get("internalDescription") ?? "").trim();
        const customerMessage = String(formData.get("customerMessage") ?? "").trim();
        if (!internalDescription) {
          setFeedback("Describa la incidencia.");
          return;
        }
        startTransition(() => {
          void (async () => {
            try {
              await enqueue({
                actionType: "trip.incident",
                tripId,
                category: "Retraso",
                internalDescription,
                customerMessage: customerMessage || undefined,
              });
              const outcome = await sync();
              (event.target as HTMLFormElement).reset();
              if (outcome.synced > 0) {
                setFeedback("Incidencia registrada y notificada.");
                router.refresh();
              } else if (!navigator.onLine || outcome.retryable > 0) {
                setFeedback("Incidencia guardada. Se enviara cuando vuelva la conexion.");
              } else {
                setFeedback("Incidencia registrada.");
              }
            } catch {
              setFeedback("No se pudo guardar la incidencia. Reintente.");
            }
          })();
        });
      }}
    >
      <TextArea label="Descripcion interna de incidencia" name="internalDescription" required />
      <TextArea help="El cliente vera este mensaje en su portal." label="Mensaje visible al cliente" name="customerMessage" />
      <button className={buttonStyles({ variant: "accent", size: "lg" })} disabled={isPending} type="submit">
        {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        Reportar
      </button>
      {feedback ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
