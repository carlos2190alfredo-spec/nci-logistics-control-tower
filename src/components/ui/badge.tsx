import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info-strong",
  progress: "bg-primary-soft text-primary-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
};

const dotStyles: Record<StatusTone, string> = {
  neutral: "bg-faint-foreground",
  info: "bg-info",
  progress: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

/** Badge de estado con punto de color: no depende solo del color para comunicar. */
export function StatusBadge({
  label,
  tone = "neutral",
  pulse = false,
  className,
}: {
  label: ReactNode;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <Badge className={className} tone={tone}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotStyles[tone], pulse && "anim-live-dot")} />
      {label}
    </Badge>
  );
}
