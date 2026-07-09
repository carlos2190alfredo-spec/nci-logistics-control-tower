import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type MetricTone = "default" | "primary" | "success" | "warning" | "danger";

const iconTone: Record<MetricTone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/**
 * Métrica de dashboard: icono, etiqueta, valor tabular y contexto.
 * Con `href` toda la tarjeta es clicable hacia la vista relacionada.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  href,
  className,
  style,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  href?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-5", iconTone[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );

  const baseStyles = cn(
    "block rounded-xl border border-border bg-surface p-4 shadow-xs",
    href && "transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-md",
    className,
  );

  if (href) {
    return (
      <Link className={baseStyles} href={href} style={style}>
        {body}
      </Link>
    );
  }

  return (
    <div className={baseStyles} style={style}>
      {body}
    </div>
  );
}
