import { Download } from "lucide-react";

/**
 * Boton de descarga CSV. Es un enlace normal (`<a download>`) al endpoint
 * de exportacion; el navegador maneja la descarga. No necesita JS de cliente.
 */
export function ExportCsvButton({
  href,
  label = "Exportar CSV",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
      download
      href={href}
    >
      <Download aria-hidden className="size-4" />
      {label}
    </a>
  );
}
