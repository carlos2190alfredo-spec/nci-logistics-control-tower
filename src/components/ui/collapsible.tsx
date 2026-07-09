import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sección colapsable sin JavaScript (details/summary nativo), accesible por
 * teclado y con chevron animado vía CSS.
 */
export function Collapsible({
  summary,
  icon,
  children,
  defaultOpen = false,
  tone = "default",
  className,
}: {
  summary: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "warning";
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-lg border",
        tone === "warning" ? "border-warning/30 bg-warning-soft/50" : "border-border bg-surface-sunken/50",
        className,
      )}
      open={defaultOpen}
    >
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60">
        <span className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-muted-foreground">
          {icon}
          {summary}
        </span>
        <ChevronDown aria-hidden className="collapsible-chevron size-4 shrink-0 text-muted-foreground" />
      </summary>
      <div className="px-3.5 pb-3.5">{children}</div>
    </details>
  );
}
