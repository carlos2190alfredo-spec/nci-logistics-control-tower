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

/** Estilos de botón consumibles desde Server y Client Components (módulo puro). */
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
