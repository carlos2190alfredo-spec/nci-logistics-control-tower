import { LifeBuoy } from "lucide-react";
import type { ActiveSupportSummary } from "@/lib/server/support-data";

/**
 * Banner de "modo soporte auditado" — visible a todos los usuarios del tenant
 * durante la sesión. Sección 22 del spec: salida visible y cierre auditado.
 */
export function SupportSessionBanner({ support }: { support: ActiveSupportSummary }) {
  return (
    <div className="border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-sm text-warning-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
        <LifeBuoy aria-hidden className="size-4 shrink-0" />
        <span className="font-semibold">Modo soporte activo</span>
        <span className="text-warning-foreground/90">
          {support.supporterEmail} está asistiendo por: {support.reason}.
        </span>
        {support.expiresAt ? (
          <span className="text-xs text-warning-foreground/80">
            Termina en {support.minutesLeft} min ({support.expiresAt.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" })}).
          </span>
        ) : null}
      </div>
    </div>
  );
}
