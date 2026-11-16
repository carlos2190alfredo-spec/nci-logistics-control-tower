"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";
import { useFormContext } from "@/components/ui/form-context";
import { cn } from "@/lib/utils";

/**
 * Botón de acción delicada (desactivar, revocar) con confirmación EN LÍNEA.
 *
 * Va dentro del `<form>` que ejecuta la acción (un `<form action={serverAction}>`
 * sencillo por fila, o un `ServerForm`). El primer botón es `type="button"` y
 * solo abre la pregunta; el envío real lo hace el botón de confirmación
 * (`type="submit"`), que no existe en el DOM hasta que se pide confirmar. Así
 * ni un clic suelto ni Intro en otro campo pueden ejecutar la acción.
 *
 * Accesibilidad:
 * - Al abrir, el foco pasa a "Cancelar" (la opción menos destructiva): repetir
 *   Intro por inercia no confirma nada. La pregunta se anuncia por `aria-live`.
 * - Escape cancela y devuelve el foco al botón original.
 * - Mientras el envío está en curso los dos botones se deshabilitan y la
 *   confirmación se cierra sola al terminar; el foco vuelve al botón original
 *   (si no lo recoge otro elemento, como la alerta de error).
 *
 * `children` se pinta dentro de la confirmación (p. ej. un campo "Motivo"
 * o `<input type="hidden">`), de modo que solo se envía si se confirma.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  message,
  variant = "danger",
  triggerVariant = "outline",
  cancelLabel = "Cancelar",
  size = "md",
  className,
  children,
}: {
  /** Texto del botón que abre la confirmación ("Desactivar"). */
  label: string;
  /** Texto del botón que envía ("Sí, desactivar"). */
  confirmLabel: string;
  /** Pregunta ("¿Desactivar a Acme S.A.?"). Diga qué ocurre además de la acción principal. */
  message: string;
  /** Estilo del botón de confirmación. */
  variant?: ButtonVariant;
  /** Estilo del botón que abre la confirmación. */
  triggerVariant?: ButtonVariant;
  cancelLabel?: string;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [wasPending, setWasPending] = useState(false);
  const status = useFormStatus();
  const form = useFormContext();
  const pending = status.pending || form.pending;
  const messageId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  // Cierre automático al terminar el envío: se deriva en el render (patrón de
  // React para "estado a partir de cambios de otro estado"), sin efecto.
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending && open) setOpen(false);
  }

  // Al abrir, el foco va a "Cancelar". Al cerrar tras cancelar o tras confirmar, el botón
  // con foco desaparece y el navegador lo deja en <body>: se devuelve al botón original,
  // salvo que el foco ya esté en otro sitio (p. ej. la alerta de error de un `ServerForm`).
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
      return;
    }
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) triggerRef.current?.focus();
  }, [open]);

  function cancel() {
    restoreFocusRef.current = true;
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    cancel();
  }

  return (
    <div aria-live="polite" className={className}>
      {open ? (
        <div
          aria-labelledby={messageId}
          className={cn(
            "anim-scale-in grid gap-2.5 rounded-lg border px-3 py-2.5 text-left",
            variant === "danger" ? "border-danger/30 bg-danger-soft/60" : "border-border bg-surface-sunken/60",
          )}
          onKeyDown={handleKeyDown}
          role="group"
        >
          <p className="text-sm font-medium text-foreground" id={messageId}>
            {message}
          </p>
          {children}
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-busy={pending}
              className={buttonStyles({ variant, size })}
              disabled={pending}
              onClick={() => {
                restoreFocusRef.current = true;
              }}
              type="submit"
            >
              {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              {confirmLabel}
            </button>
            <button className={buttonStyles({ variant: "outline", size })} disabled={pending} onClick={cancel} ref={cancelRef} type="button">
              {cancelLabel}
            </button>
          </div>
        </div>
      ) : (
        <button className={buttonStyles({ variant: triggerVariant, size })} onClick={() => setOpen(true)} ref={triggerRef} type="button">
          {label}
        </button>
      )}
    </div>
  );
}
