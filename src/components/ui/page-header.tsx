import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Breadcrumb = { label: string; href?: string };

/**
 * Encabezado de página reutilizable: breadcrumb, título, descripción,
 * etiqueta contextual y acciones en posición predecible.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid gap-2", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Ruta de navegacion">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-faint-foreground">
            {breadcrumbs.map((crumb, index) => (
              <li className="flex items-center gap-1" key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight aria-hidden className="size-3" /> : null}
                {crumb.href ? (
                  <Link className="font-medium transition-colors hover:text-foreground" href={crumb.href}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-muted-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
