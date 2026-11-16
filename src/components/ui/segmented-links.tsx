import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentedLinkItem = {
  label: string;
  href: string;
  /** Vista actual: se marca con `aria-current="page"` y un fondo propio (no solo color). */
  active: boolean;
  /** Cantidad opcional junto al texto (p. ej. "Vehículos 12"). */
  count?: number;
};

/**
 * Enlaces con aspecto de pestañas para alternar entre vistas de una misma
 * página (p. ej. Vehículos / Equipos con `?vista=`).
 *
 * Son ENLACES, no un `tablist`: cada opción navega a su URL (se puede abrir en
 * otra pestaña, funciona sin JavaScript y el botón Atrás se comporta). Por eso
 * la semántica es `nav` + lista de enlaces con `aria-current="page"`, y el
 * teclado es el nativo (Tab, Intro). Un `tablist` exigiría gestionar las flechas
 * y los paneles, y no corresponde a una navegación.
 */
export function SegmentedLinks({
  items,
  label = "Secciones",
  className,
}: {
  items: ReadonlyArray<SegmentedLinkItem>;
  /** Nombre accesible de la navegación (distinto del de otras `nav` de la página). */
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("max-w-full", className)}>
      <ul className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-sunken p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150",
                item.active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              href={item.href}
            >
              {item.label}
              {item.count !== undefined ? (
                <>
                  {/* Espacio real entre texto y cantidad: el nombre accesible es "Vehículos 12" y no depende de cómo cada lector concatene hijos de un contenedor flex (el espacio no se dibuja). */}
                  {" "}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", item.active ? "bg-primary-soft text-primary-strong" : "bg-muted text-muted-foreground")}>
                    {item.count}
                  </span>
                </>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
