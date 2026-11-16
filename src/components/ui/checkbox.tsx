"use client";

import { useId, type ReactNode } from "react";
import { OctagonAlert } from "lucide-react";
import { describeField, helpIdFor } from "@/components/ui/field-state";
import { useFormContext } from "@/components/ui/form-context";
import { cn } from "@/lib/utils";

/**
 * Casilla de verificación con etiqueta, ayuda y error por campo.
 *
 * - Una casilla desmarcada NO se envía con el formulario: en el servidor lea
 *   `formData.get(name) === "on"` (o el `value` indicado). Nunca `!== "off"`.
 * - Toda la fila es el área de clic/toque (mín. 40 px de alto); la casilla
 *   visible es pequeña, la etiqueta es el objetivo.
 * - Lee `fieldErrors[name]` del `ServerForm` (o la prop `error`) igual que `Field`.
 */
export function CheckboxField({
  label,
  name,
  help,
  defaultChecked,
  disabled,
  required = false,
  value = "on",
  id,
  error,
  className,
}: {
  label: ReactNode;
  name: string;
  help?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Valor que se envía cuando está marcada (por defecto "on", el de HTML). */
  value?: string;
  id?: string;
  error?: string;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const { fieldErrors } = useFormContext();
  const description = describeField({ name, controlId, hasHelp: Boolean(help), explicitError: error, fieldErrors });

  return (
    <div className={cn("grid gap-1", className)}>
      <label className={cn("flex min-h-10 items-start gap-2.5 rounded-lg py-2 text-sm text-foreground", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")} htmlFor={controlId}>
        <input
          aria-describedby={description.describedBy}
          aria-invalid={description.invalid ? true : undefined}
          className={cn("mt-0.5 size-4 shrink-0 rounded border-border accent-primary", disabled && "cursor-not-allowed")}
          defaultChecked={defaultChecked}
          disabled={disabled}
          id={controlId}
          name={name}
          required={required}
          type="checkbox"
          value={value}
        />
        <span className={cn("font-medium", description.invalid && "text-danger-strong")}>
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </span>
      </label>
      {description.error ? (
        <p className="flex items-start gap-1.5 pl-[1.625rem] text-xs font-medium text-danger-strong" id={description.errorId}>
          <OctagonAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{description.error}</span>
        </p>
      ) : null}
      {help ? (
        <p className="pl-[1.625rem] text-xs text-muted-foreground" id={helpIdFor(controlId)}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
