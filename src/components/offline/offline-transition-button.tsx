"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useOfflineContext } from "@/components/offline/offline-provider";
import { buttonStyles } from "@/components/ui/button-styles";
import { tripStatusLabel } from "@/lib/ui/status";
import type { TripStatus } from "@/generated/prisma";
import { DRIVER_ALLOWED_TRANSITIONS } from "@/lib/offline/protocol";

/**
 * Selector + botón de avance que:
 * - Encola en IndexedDB (funciona offline).
 * - Sincroniza inmediatamente si hay red.
 * - Si el sync confirma la transición, refresca datos del servidor para
 *   que el conductor vea la siguiente acción disponible.
 */
export function OfflineTransitionButton({
  tripId,
  options,
}: {
  tripId: string;
  options: TripStatus[];
}) {
  const router = useRouter();
  const { enqueue, sync } = useOfflineContext();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = options.filter((status) => (DRIVER_ALLOWED_TRANSITIONS as readonly string[]).includes(status));
  const [nextStatus, setNextStatus] = useState<TripStatus | "">(filtered[0] ?? "");

  if (filtered.length === 0) return null;

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!nextStatus) return;
        startTransition(() => {
          void (async () => {
            try {
              await enqueue({
                actionType: "trip.transition",
                tripId,
                nextStatus: nextStatus as TripStatus,
                note: "Accion registrada por conductor.",
              });
              const outcome = await sync();
              if (outcome.synced > 0) {
                setFeedback("Accion confirmada por el servidor.");
                router.refresh();
              } else if (outcome.unauthenticated) {
                setFeedback("Su sesion caduco. Inicie sesion para continuar.");
              } else if (!navigator.onLine || outcome.retryable > 0) {
                setFeedback("Accion registrada. Se sincronizara cuando vuelva la conexion.");
              } else if (outcome.conflicts > 0 || outcome.rejected > 0) {
                setFeedback("La accion fue rechazada. Revise la cola de acciones.");
                router.refresh();
              } else {
                setFeedback("Accion registrada.");
              }
            } catch {
              setFeedback("No se pudo guardar la accion. Reintente.");
            }
          })();
        });
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium text-foreground">
        Siguiente accion
        <select
          className="min-h-14 w-full rounded-lg border border-border bg-surface px-3 text-base font-semibold text-foreground shadow-xs transition-colors hover:border-border-strong focus:border-primary"
          name="nextStatus"
          value={nextStatus}
          onChange={(event) => setNextStatus(event.target.value as TripStatus)}
        >
          {filtered.map((status) => (
            <option key={status} value={status}>
              {tripStatusLabel[status]}
            </option>
          ))}
        </select>
      </label>
      <button className={buttonStyles({ variant: "secondary", size: "lg" })} disabled={isPending} type="submit">
        {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        Confirmar accion
      </button>
      {feedback ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
