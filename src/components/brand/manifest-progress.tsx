import { Check } from "lucide-react";
import type { TripStatus } from "@/generated/prisma";
import { manifestStages } from "@/lib/ui/manifest";
import { cn } from "@/lib/utils";

/**
 * Hitos del manifiesto para un servicio real del cliente: cada etapa cumplida
 * aparece sellada. Es informacion (lista ordenada con estado), no decoracion.
 */
export function ManifestProgress({
  status,
  className,
}: {
  status: TripStatus;
  className?: string;
}) {
  const stages = manifestStages(status);
  return (
    <ol
      aria-label="Hitos del servicio"
      className={cn("grid grid-cols-3 gap-y-4 sm:grid-cols-6", className)}
    >
      {stages.map((stage, index) => (
        <li
          className="relative grid justify-items-center gap-1.5 text-center"
          key={stage.label}
        >
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-[17px] right-1/2 hidden h-px w-full sm:block",
                stage.state === "pending" ? "bg-border-strong" : "bg-signal",
              )}
            />
          ) : null}
          <span
            className={cn(
              "manifest-seal relative grid size-9 place-items-center rounded-full border font-mono text-[11px] font-bold",
              stage.state === "done" && "border-signal bg-signal text-white",
              stage.state === "current" &&
                "border-signal bg-surface text-signal ring-4 ring-signal/15",
              stage.state === "pending" &&
                "border-border-strong bg-surface text-faint-foreground",
            )}
            style={{ "--i": index } as React.CSSProperties}
          >
            {stage.state === "done" ? (
              <Check aria-hidden className="size-4" strokeWidth={3} />
            ) : (
              String(index + 1).padStart(2, "0")
            )}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              stage.state === "pending"
                ? "text-faint-foreground"
                : "text-foreground",
            )}
          >
            {stage.label}
            <span className="sr-only">
              {stage.state === "done"
                ? " (completado)"
                : stage.state === "current"
                  ? " (en curso)"
                  : " (pendiente)"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
