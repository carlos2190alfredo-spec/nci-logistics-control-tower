"use client";

import Link from "next/link";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="anim-page grid max-w-md place-items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-md" role="alert">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="size-7" />
        </span>
        <h1 className="text-xl font-bold text-foreground">Algo salio mal</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Ocurrio un error inesperado al procesar la solicitud. Puede reintentar la operacion; si el problema persiste,
          contacte a su administrador.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button className={buttonStyles({ variant: "secondary" })} onClick={() => reset()} type="button">
            <RefreshCcw aria-hidden className="size-4" />
            Reintentar
          </button>
          <Link className={buttonStyles({ variant: "outline" })} href="/">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
