"use client";

import { Search } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition, type ReactNode } from "react";

type FilterOption = { value: string; label: string };

type FilterConfig = {
  key: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
};

export function SearchToolbar({
  placeholder = "Buscar...",
  filters = [],
  children,
}: {
  placeholder?: string;
  filters?: FilterConfig[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const handleSearch = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const q = (form.get("q") as string)?.trim() ?? "";
      updateParams("q", q);
    },
    [updateParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form className="relative flex-1 min-w-[200px] max-w-sm" onSubmit={handleSearch}>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="Buscar"
          className="min-h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground shadow-xs transition-colors duration-150 placeholder:text-faint-foreground hover:border-border-strong focus:border-primary"
          defaultValue={searchParams.get("q") ?? ""}
          maxLength={200}
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </form>

      {filters.map((f) => (
        <select
          key={f.key}
          aria-label={f.label}
          className="min-h-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-xs transition-colors duration-150 hover:border-border-strong focus:border-primary"
          defaultValue={searchParams.get(f.key) ?? ""}
          onChange={(e) => updateParams(f.key, e.target.value)}
        >
          <option value="">{f.allLabel ?? `Todos (${f.label})`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {children}

      {isPending && (
        <div aria-label="Cargando" className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      )}
    </div>
  );
}
