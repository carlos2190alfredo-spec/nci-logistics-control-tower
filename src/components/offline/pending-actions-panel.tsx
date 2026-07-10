"use client";

import { AlertTriangle, Ban, Clock, RefreshCcw, TriangleAlert } from "lucide-react";
import { useOfflineContext } from "@/components/offline/offline-provider";
import { discardCommand } from "@/lib/offline/queue";
import type { LocalCommandRecord } from "@/lib/offline/db";
import { tripStatusLabel } from "@/lib/ui/status";
import type { TripStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const errorMessage: Record<string, string> = {
  SESSION_EXPIRED: "Su sesion caducó. Vuelva a iniciar sesion para continuar.",
  RATE_LIMITED: "Servidor ocupado. Se reintentará automáticamente.",
  NETWORK_ERROR: "Sin conexión con el servidor. Se reintentará cuando vuelva.",
  BAD_RESPONSE: "Respuesta invalida del servidor. Se reintentará.",
  MISSING_RESULT: "El servidor no devolvió el resultado del comando.",
  STATE_CONFLICT: "El estado del viaje cambió antes de sincronizar.",
  ASSIGNMENT_CHANGED: "El viaje ya no le pertenece.",
  PAYLOAD_TAMPERED: "El contenido de la acción fue alterado.",
  SYNC_REJECTED: "La acción fue rechazada por el servidor.",
  RESOURCE_NOT_FOUND: "El viaje no existe o ya no le pertenece.",
};

function describe(record: LocalCommandRecord): string {
  const payload = (record.command as { payload: { actionType: string; nextStatus?: TripStatus } }).payload;
  if (payload.actionType === "trip.transition" && payload.nextStatus) {
    return `Transicion a ${tripStatusLabel[payload.nextStatus]}`;
  }
  if (payload.actionType === "trip.incident") return "Incidencia reportada";
  return record.actionType;
}

/** Panel accesible con pendientes, reintentos y conflictos del conductor. */
export function PendingActionsPanel({ className }: { className?: string }) {
  const { pending, retryable, conflicts, rejected, refresh, sync } = useOfflineContext();

  const groups = [
    { title: "Enviando", tone: "bg-primary-soft text-primary-strong border-primary/25", icon: <Clock className="size-4" />, records: pending },
    { title: "Reintentando", tone: "bg-warning-soft text-warning-strong border-warning/25", icon: <RefreshCcw className="size-4" />, records: retryable },
    { title: "Conflictos", tone: "bg-danger-soft text-danger-strong border-danger/25", icon: <TriangleAlert className="size-4" />, records: conflicts },
    { title: "Rechazados", tone: "bg-danger-soft text-danger-strong border-danger/25", icon: <AlertTriangle className="size-4" />, records: rejected },
  ];

  const hasAny = groups.some((group) => group.records.length > 0);
  if (!hasAny) return null;

  return (
    <section aria-label="Acciones pendientes de sincronizar" className={cn("grid gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs", className)}>
      <h3 className="text-sm font-bold text-foreground">Cola de acciones offline</h3>
      {groups
        .filter((group) => group.records.length)
        .map((group) => (
          <div className={cn("rounded-lg border p-3", group.tone)} key={group.title}>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              {group.icon}
              {group.title}
              <span className="tabular-nums">({group.records.length})</span>
            </div>
            <ul className="grid gap-2">
              {group.records.map((record) => (
                <li className="rounded-md bg-surface/70 p-2 text-sm text-foreground" key={record.localCommandId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{describe(record)}</p>
                    <span className="text-[11px] font-mono text-faint-foreground">#{record.localCommandId.slice(0, 6)}</span>
                  </div>
                  {record.lastErrorCode ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {errorMessage[record.lastErrorCode] ?? "Error temporal."}
                    </p>
                  ) : null}
                  {record.nextRetryAt ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-faint-foreground">
                      Proximo intento:{" "}
                      {new Date(record.nextRetryAt).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  ) : null}
                  {(record.status === "CONFLICT" || record.status === "REJECTED") ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
                        onClick={async () => {
                          await discardCommand(record);
                          refresh();
                        }}
                        type="button"
                      >
                        <Ban aria-hidden className="size-3.5" />
                        Descartar
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {retryable.length ? (
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-muted"
          onClick={() => {
            void sync();
          }}
          type="button"
        >
          <RefreshCcw aria-hidden className="size-3.5" />
          Reintentar ahora
        </button>
      ) : null}
    </section>
  );
}
