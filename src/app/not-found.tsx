import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="anim-page grid max-w-md place-items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-md">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
          <Compass className="size-7" />
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-faint-foreground">Error 404</p>
        <h1 className="text-xl font-bold text-foreground">Pagina no encontrada</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          La ruta solicitada no existe o ya no esta disponible. Verifique la direccion o vuelva al inicio.
        </p>
        <Link className={buttonStyles({ variant: "secondary", className: "mt-3" })} href="/">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
