import { OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type UsageLevel = "ok" | "warning" | "danger";

export type UsageState = {
  /** Ancho de la barra: 0–100, redondeado. */
  percent: number;
  level: UsageLevel;
  /** Texto del estado cuando hay que avisar; `null` si todo va bien. */
  statusText: string | null;
};

/** Umbral de advertencia: desde el 90 % del límite. El 100 % ya es peligro. */
export const USAGE_WARNING_RATIO = 0.9;

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Estado de consumo de un límite de plan. Los niveles se calculan con la razón
 * exacta, no con el porcentaje redondeado (89,6 % no es "cerca del límite").
 * Un límite 0 no deja cupo: cuenta como límite alcanzado.
 */
export function getUsageState(used: number, max: number): UsageState {
  const safeUsed = nonNegative(used);
  const safeMax = nonNegative(max);
  const ratio = safeMax > 0 ? safeUsed / safeMax : 1;
  const percent = Math.min(100, Math.round(ratio * 100));
  if (safeUsed > safeMax) return { percent, level: "danger", statusText: "Límite superado" };
  if (ratio >= 1) return { percent, level: "danger", statusText: "Límite alcanzado" };
  if (ratio >= USAGE_WARNING_RATIO) return { percent, level: "warning", statusText: "Cerca del límite" };
  return { percent, level: "ok", statusText: null };
}

const barTone: Record<UsageLevel, string> = {
  ok: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Consumo de un límite del plan ("5/6 clientes"). Misma apariencia que la barra
 * original de Configuración; añade el estado en TEXTO (con icono) a partir del
 * 90 % para que el aviso no dependa del color de la barra.
 */
export function UsageBar({ label, used, max, className }: { label: string; used: number; max: number; className?: string }) {
  const state = getUsageState(used, max);

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span aria-hidden>
            {used}/{max}
          </span>
          <span className="sr-only">
            {used} de {max}
          </span>
        </span>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn("h-full rounded-full transition-[width] duration-300", barTone[state.level])} style={{ width: `${state.percent}%` }} />
      </div>
      {state.statusText ? (
        <p className={cn("flex items-center gap-1.5 text-xs font-medium", state.level === "danger" ? "text-danger-strong" : "text-warning-strong")}>
          {state.level === "danger" ? <OctagonAlert aria-hidden className="size-3.5 shrink-0" /> : <TriangleAlert aria-hidden className="size-3.5 shrink-0" />}
          {state.statusText}
        </p>
      ) : null}
    </div>
  );
}
