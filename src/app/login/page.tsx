import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Radar } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="control-grid relative hidden flex-col justify-between bg-nav p-10 text-nav-foreground lg:flex">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-nav-active">NCI Automation</p>
          <p className="mt-2 text-2xl font-bold text-white">Logistics Control Tower</p>
        </div>
        <div className="anim-slide-in-left max-w-md">
          <Radar aria-hidden className="size-10 text-nav-active" />
          <p className="mt-6 text-2xl font-bold leading-9 text-white">
            Toda su operacion de transporte, visible y bajo control.
          </p>
          <p className="mt-4 text-sm leading-7 text-nav-muted">
            Solicitudes, asignaciones, avance del conductor, incidencias y prueba de entrega digital: un solo lugar para
            operaciones, clientes y conductores.
          </p>
        </div>
        <p className="text-xs text-nav-muted">Tecnologia desarrollada por NCI Automation</p>
      </section>

      <section className="grid place-items-center bg-background px-4 py-10">
        <div className="anim-page w-full max-w-md">
          <Link className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" href="/">
            <ArrowLeft aria-hidden className="size-4" />
            Volver al inicio
          </Link>
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Acceso a la plataforma</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">NCI Logistics Control Tower</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ingrese con su cuenta de operaciones, cliente o conductor. Su acceso queda registrado.
            </p>
            <div className="mt-6">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-faint-foreground">
            ¿Problemas para entrar? Contacte a su administrador de flota.
          </p>
        </div>
      </section>
    </main>
  );
}
