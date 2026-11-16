import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DefinitionItem = {
  term: ReactNode;
  /** `null`, `undefined`, `""` y `false` se muestran como "—" (con "Sin dato" para lectores de pantalla). El `0` sí es un valor. */
  description: ReactNode;
  /** Código o referencia: fuente monoespaciada. */
  mono?: boolean;
};

function isEmpty(value: ReactNode): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

/**
 * Lista de definiciones (`<dl>`) para fichas de detalle.
 *
 * - `layout="rows"` (por defecto): dos columnas, término a la izquierda y valor
 *   a la derecha, con divisor entre filas; en móvil se apilan. Pensada para
 *   tarjetas estrechas.
 * - `layout="grid"`: cada par apilado (término pequeño sobre el valor) y los
 *   pares en dos columnas desde `sm`; para fichas anchas con muchos datos.
 */
export function DefinitionList({
  items,
  layout = "rows",
  className,
}: {
  items: ReadonlyArray<DefinitionItem>;
  layout?: "rows" | "grid";
  className?: string;
}) {
  return (
    <dl className={cn("text-sm", layout === "grid" ? "grid gap-x-6 gap-y-3.5 sm:grid-cols-2" : "grid", className)}>
      {items.map((item, index) => (
        <div
          className={cn(
            "min-w-0",
            layout === "rows" && "grid gap-x-4 gap-y-0.5 border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]",
          )}
          key={index}
        >
          <dt className="text-muted-foreground">{item.term}</dt>
          <dd className={cn("min-w-0 break-words font-medium text-foreground", layout === "grid" && "mt-0.5", item.mono && "font-mono text-[13px]")}>
            {isEmpty(item.description) ? (
              <>
                <span aria-hidden>—</span>
                <span className="sr-only">Sin dato</span>
              </>
            ) : (
              item.description
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
