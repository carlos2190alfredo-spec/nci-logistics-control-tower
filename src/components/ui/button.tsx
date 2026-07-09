"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "accent" | "success" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
  secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary-hover",
  accent: "bg-accent text-white shadow-xs hover:bg-accent-hover",
  success: "bg-success text-white shadow-xs hover:bg-success-hover",
  outline: "border border-border bg-surface text-foreground shadow-xs hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-danger text-white shadow-xs hover:bg-danger-hover",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-14 px-5 text-base",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,box-shadow,transform,color] duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

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
