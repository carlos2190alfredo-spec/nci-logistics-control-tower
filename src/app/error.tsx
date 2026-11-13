"use client";

import Link from "next/link";
import { RefreshCcw, TriangleAlert } from "lucide-react";

/*
 * Error de segmento con la identidad "Manifiesto del istmo" (papel, tinta, señal).
 * Debe seguir siendo un componente cliente: Next le entrega `reset` para reintentar.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-16 text-ink">
      <div className="anim-page w-full max-w-xl" role="alert">
        <span
          aria-hidden
          className="grid size-24 place-items-center rounded-full border border-dashed border-signal text-signal-strong"
        >
          <TriangleAlert className="size-9" />
        </span>
        <p className="mt-8 flex items-center gap-3 font-mono text-[11px] font-bold tracking-[0.22em] text-signal-strong">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-signal"
          />
          ERROR INESPERADO
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[0.95] font-black tracking-tight text-balance [font-stretch:112%] sm:text-5xl">
          Algo salió mal
        </h1>
        <p className="mt-4 max-w-md leading-7 text-ink-muted">
          Ocurrió un error inesperado al procesar la solicitud. Puede reintentar
          la operación; si el problema persiste, contacte a su administrador.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-ink-muted">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-13 items-center gap-2 rounded-full bg-signal px-7 text-base font-semibold text-white transition-colors duration-200 hover:bg-signal-strong"
            onClick={() => reset()}
            type="button"
          >
            <RefreshCcw aria-hidden className="size-4.5" />
            Reintentar
          </button>
          <Link
            className="inline-flex min-h-13 items-center rounded-full border border-ink px-7 text-base font-semibold transition-colors duration-200 hover:bg-ink hover:text-paper"
            href="/"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
