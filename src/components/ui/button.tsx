"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";
import { useFormContext } from "@/components/ui/form-context";

/**
 * Botón de envío con estado de carga automático: se deshabilita durante el
 * submit del formulario padre y muestra spinner, evitando dobles envíos.
 * El texto no cambia durante la carga para mantener estable el nombre accesible.
 *
 * Funciona en los dos tipos de formulario del sistema:
 * - `<form action={fn}>` / `ActionForm`: el estado pendiente lo da `useFormStatus`.
 * - `ServerForm` (envía por JavaScript, sin `<form action>`): `useFormStatus` no
 *   lo ve, así que se lee del contexto del formulario. Además queda
 *   deshabilitado hasta hidratar (`ready`), para que un clic temprano no haga un
 *   envío nativo. Fuera de un `ServerForm` el contexto es neutro y el
 *   comportamiento es el de siempre.
 *
 * `disabled` añade una condición propia de la pantalla (p. ej. "Importar 0
 * filas" mientras no haya filas válidas). No muestra el spinner: el spinner
 * solo indica un envío en curso.
 */
export function SubmitButton({
  children,
  className,
  variant = "primary",
  size = "md",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const form = useFormContext();
  const pending = status.pending || form.pending;

  return (
    <button aria-busy={pending} className={buttonStyles({ variant, size, className })} disabled={pending || !form.ready || disabled} type="submit">
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
