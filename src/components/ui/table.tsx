import type { ComponentPropsWithoutRef, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabla empresarial consistente: encabezado sticky, hover por fila,
 * números tabulares y scroll horizontal contenido en su tarjeta.
 */
export function DataTable({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cn("relative overflow-x-auto rounded-lg border border-border", className)}>
      <table className="w-full min-w-[560px] text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-sunken text-xs uppercase tracking-wide text-muted-foreground">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border bg-surface">{children}</tbody>;
}

export function TableRow({ children, className, ...props }: ComponentPropsWithoutRef<"tr"> & { children: ReactNode }) {
  return (
    <tr className={cn("transition-colors duration-100 hover:bg-muted/60", className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHeaderCell({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { children: ReactNode }) {
  return (
    <th className={cn("px-4 py-3 font-semibold", className)} scope="col" {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className, numeric = false, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { children: ReactNode; numeric?: boolean }) {
  return (
    <td className={cn("px-4 py-3 align-middle", numeric && "tabular-nums", className)} {...props}>
      {children}
    </td>
  );
}
