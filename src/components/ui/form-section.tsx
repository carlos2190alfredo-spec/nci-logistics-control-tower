import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sección de un formulario largo: `fieldset` + `legend` (los lectores de
 * pantalla anuncian el grupo al entrar), descripción opcional y rejilla de
 * 1 columna en móvil y 2 desde `sm` (`columns={1}` la mantiene en una).
 *
 * Los campos que deban ocupar todo el ancho llevan `className="sm:col-span-2"`.
 * `disabled` deshabilita todos los controles de la sección (no se envían).
 *
 * `min-w-0` es necesario: sin él el `fieldset` toma `min-width: min-content` y
 * desborda en pantallas de 375 px cuando un hijo es ancho.
 *
 * `items-start` evita que la rejilla estire los campos de una fila al alto del
 * más alto (un campo con ayuda o con error haría crecer el control de su
 * vecino y desalinearía la fila).
 */
export function FormSection({
  title,
  description,
  icon,
  columns = 2,
  disabled,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Icono Lucide decorativo junto al título (`aria-hidden`). */
  icon?: ReactNode;
  columns?: 1 | 2;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const descriptionId = useId();
  return (
    <fieldset
      aria-describedby={description ? descriptionId : undefined}
      className={cn("min-w-0 rounded-lg border border-border p-4", className)}
      disabled={disabled}
    >
      <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-foreground">
        {icon ? (
          <span aria-hidden className="text-primary [&>svg]:size-4">
            {icon}
          </span>
        ) : null}
        {title}
      </legend>
      {description ? (
        <p className="mb-3.5 text-xs text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      ) : null}
      <div className={cn("grid items-start gap-3.5", columns === 2 && "sm:grid-cols-2")}>{children}</div>
    </fieldset>
  );
}
