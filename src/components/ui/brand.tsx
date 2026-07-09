import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BrandingInput = {
  wordmark?: string | null;
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
} | null;

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeColor(value: string | null | undefined, fallback: string) {
  return value && HEX_PATTERN.test(value) ? value : fallback;
}

/**
 * Aplica el branding del tenant como variables CSS en su subárbol.
 * Los colores llegan del tenant ya autorizado en servidor (nunca de parámetros
 * del cliente) y solo se usan en acentos decorativos con contraste garantizado
 * por los tokens base — el texto nunca se pinta con colores del tenant.
 */
export function TenantBrandingProvider({
  branding,
  children,
  className,
}: {
  branding: BrandingInput;
  children: ReactNode;
  className?: string;
}) {
  const style = {
    "--brand-primary": safeColor(branding?.primary, "#0f2d46"),
    "--brand-secondary": safeColor(branding?.secondary, "#1d4ed8"),
    "--brand-accent": safeColor(branding?.accent, "#ea580c"),
  } as CSSProperties;

  return (
    <div className={cn("contents", className)} style={style}>
      {children}
    </div>
  );
}

/** Sello de marca: inicial sobre el color primario del tenant o de NCI. */
export function BrandMark({ name, className, size = "md" }: { name: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-[var(--brand-primary)] font-bold text-white",
        size === "sm" && "size-7 text-[10px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-11 text-sm",
        className,
      )}
    >
      {initials}
    </span>
  );
}
