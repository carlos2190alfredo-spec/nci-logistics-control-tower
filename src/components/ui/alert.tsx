import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneStyles: Record<AlertTone, string> = {
  info: "border-info/30 bg-info-soft text-info-strong",
  success: "border-success/30 bg-success-soft text-success-strong",
  warning: "border-warning/30 bg-warning-soft text-warning-strong",
  danger: "border-danger/30 bg-danger-soft text-danger-strong",
};

const toneIcon: Record<AlertTone, ReactNode> = {
  info: <Info aria-hidden className="size-4 shrink-0" />,
  success: <CheckCircle2 aria-hidden className="size-4 shrink-0" />,
  warning: <AlertTriangle aria-hidden className="size-4 shrink-0" />,
  danger: <OctagonAlert aria-hidden className="size-4 shrink-0" />,
};

/** Alerta inline. Los tonos warning/danger se anuncian a lectores de pantalla. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const isUrgent = tone === "danger" || tone === "warning";

  return (
    <div className={cn("flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", toneStyles[tone], className)} role={isUrgent ? "alert" : "status"}>
      <span className="mt-0.5">{toneIcon[tone]}</span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
