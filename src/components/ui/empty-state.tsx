import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Estado vacío con icono, mensaje útil y acción recomendada opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-xl border border-dashed border-border-strong bg-surface-sunken/60 text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-surface text-faint-foreground shadow-xs [&>svg]:size-5">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
