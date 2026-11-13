import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/*
 * 404 con la identidad "Manifiesto del istmo": papel, tinta y señal; el sello
 * discontinuo repite el de los hitos de la landing. Todo contraste verificado AA
 * (tinta y tinta secundaria sobre papel, señal fuerte sobre papel, blanco sobre señal).
 */
export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-16 text-ink">
      <div className="anim-page w-full max-w-xl">
        <span
          aria-hidden
          className="grid size-24 place-items-center rounded-full border border-dashed border-signal font-mono text-2xl font-bold text-signal-strong"
        >
          404
        </span>
        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-bold tracking-[0.22em] text-signal-strong">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-signal"
          />
          ERROR 404
          <span aria-hidden className="text-ink/30">
            /
          </span>
          RUTA NO ENCONTRADA
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[0.95] font-black tracking-tight text-balance [font-stretch:112%] sm:text-5xl">
          Página no encontrada
        </h1>
        <p className="mt-4 max-w-md leading-7 text-ink-muted">
          La ruta solicitada no existe o ya no está disponible. Verifique la
          dirección o vuelva al inicio.
        </p>
        <Link
          className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-full bg-signal px-7 text-base font-semibold text-white transition-colors duration-200 hover:bg-signal-strong"
          href="/"
        >
          <ArrowLeft aria-hidden className="size-4.5" />
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
