import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status";

const markerTone: Record<StatusTone, string> = {
  neutral: "border-border-strong bg-surface text-faint-foreground",
  info: "border-info/40 bg-info-soft text-info",
  progress: "border-primary/40 bg-primary-soft text-primary",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn("grid gap-0", className)}>{children}</ol>;
}

/** Hito de línea de tiempo con marcador, título, hora y detalle opcional. */
export function TimelineItem({
  title,
  meta,
  description,
  icon,
  tone = "neutral",
  isLast = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: StatusTone;
  isLast?: boolean;
}) {
  return (
    <li className="relative grid grid-cols-[auto_1fr] gap-x-3">
      <div className="flex flex-col items-center">
        <span aria-hidden className={cn("z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 [&>svg]:size-3.5", markerTone[tone])}>
          {icon ?? <span className="size-1.5 rounded-full bg-current" />}
        </span>
        {!isLast ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
      </div>
      <div className={cn("min-w-0", !isLast && "pb-5")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {meta ? <span className="text-xs tabular-nums text-faint-foreground">{meta}</span> : null}
        </div>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </li>
  );
}
