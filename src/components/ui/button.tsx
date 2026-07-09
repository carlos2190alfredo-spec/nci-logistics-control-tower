"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";

/**
 * Botón de envío con estado de carga automático: se deshabilita durante el
 * submit del formulario padre y muestra spinner, evitando dobles envíos.
 * El texto no cambia durante la carga para mantener estable el nombre accesible.
 */
export function SubmitButton({
  children,
  className,
  variant = "primary",
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { pending } = useFormStatus();

  return (
    <button aria-busy={pending} className={buttonStyles({ variant, size, className })} disabled={pending} type="submit">
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
