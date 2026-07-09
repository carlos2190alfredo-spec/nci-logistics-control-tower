import { Download, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

/** Documento descargable con icono por tipo, nombre legible y metadatos. */
export function DocumentCard({
  href,
  filename,
  mimeType,
  createdAt,
  label,
  className,
}: {
  href: string;
  filename: string;
  mimeType: string;
  createdAt?: Date | string;
  label?: string;
  className?: string;
}) {
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  return (
    <a
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-sm",
        className,
      )}
      href={href}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg [&>svg]:size-5",
          isPdf ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
        )}
      >
        {isImage ? <ImageIcon /> : <FileText />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{label ?? filename}</span>
        <span className="block text-xs text-muted-foreground">
          {isPdf ? "PDF" : isImage ? "Imagen" : "Archivo"}
          {createdAt ? ` · ${formatDate(createdAt)}` : ""}
        </span>
      </span>
      <Download aria-hidden className="size-4 shrink-0 text-faint-foreground transition-colors group-hover:text-primary" />
    </a>
  );
}
