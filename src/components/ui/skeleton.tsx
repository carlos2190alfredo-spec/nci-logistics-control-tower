import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-sunken", className)} />;
}

/** Skeleton de página estándar: métricas + dos paneles. Para loading.tsx. */
export function PageSkeleton({ metrics = 4 }: { metrics?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando contenido" className="grid gap-6" role="status">
      <div className="grid gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: metrics }).map((_, index) => (
          <Skeleton className="h-28" key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
