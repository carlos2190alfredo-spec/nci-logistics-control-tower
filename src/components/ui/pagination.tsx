import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  total: number;
  pageSize: number;
  buildUrl: (page: number) => string;
};

export function Pagination({ page, totalPages, hasNext, hasPrev, total, pageSize, buildUrl }: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages = getVisiblePages(page, totalPages);

  return (
    <nav aria-label="Paginacion" className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {start}–{end} de {total}
      </p>
      <div className="flex items-center gap-1">
        <PaginationLink disabled={!hasPrev} href={buildUrl(page - 1)} label="Anterior">
          <ChevronLeft className="size-4" />
        </PaginationLink>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">…</span>
          ) : (
            <PaginationLink key={p} active={p === page} href={buildUrl(p as number)} label={`Pagina ${p}`}>
              {p}
            </PaginationLink>
          ),
        )}

        <PaginationLink disabled={!hasNext} href={buildUrl(page + 1)} label="Siguiente">
          <ChevronRight className="size-4" />
        </PaginationLink>
      </div>
    </nav>
  );
}

function PaginationLink({
  href,
  children,
  label,
  active,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const base = "inline-flex size-8 items-center justify-center rounded-md text-sm font-medium transition-colors duration-100";
  if (disabled) {
    return (
      <span aria-disabled aria-label={label} className={cn(base, "cursor-not-allowed text-muted-foreground/40")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        base,
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

function getVisiblePages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];

  if (current > 3) pages.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("…");

  pages.push(total);

  return pages;
}
