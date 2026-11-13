import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IsthmusRoute } from "@/components/brand/isthmus-route";
import { siteOpenGraph, siteTwitter } from "@/components/brand/site";
import { LoginForm } from "@/components/login-form";
import { isLocalEnv } from "@/lib/app-env";

export const dynamic = "force-dynamic";

const pageTitle = "Acceso";
const pageDescription =
  "Ingreso a la plataforma para operaciones, clientes y conductores. Cada acceso queda registrado.";

// Titulo "Acceso · NCI LCT" por la plantilla del layout; canonica relativa a metadataBase.
export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/login" },
  openGraph: siteOpenGraph({
    title: pageTitle,
    description: pageDescription,
    url: "/login",
  }),
  twitter: siteTwitter({ title: pageTitle, description: pageDescription }),
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-paper text-ink lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-paper lg:flex xl:p-14">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-black [font-stretch:125%]">
            NCI
          </span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-fog">
            LOGISTICS CONTROL TOWER
          </span>
        </div>
        <div className="anim-slide-in-left">
          <IsthmusRoute className="w-full max-w-xl" />
          <p className="mt-8 max-w-md font-display text-3xl leading-tight font-black tracking-tight text-balance [font-stretch:112%]">
            Toda su operación de transporte, visible y bajo control.
          </p>
          <p className="mt-4 max-w-md text-sm leading-7 text-fog">
            Solicitudes, asignaciones, avance del conductor, incidencias y
            prueba de entrega digital: un solo lugar para operaciones, clientes
            y conductores.
          </p>
        </div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-fog">
          Tecnología desarrollada por NCI Automation
        </p>
      </section>

      <section className="grid place-items-center px-4 py-10">
        <div className="anim-page w-full max-w-md">
          <Link
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            href="/"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Volver al inicio
          </Link>
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.22em] text-signal-strong">
            <span className="inline-block size-2 rounded-full bg-signal" />
            Acceso a la plataforma
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[0.95] font-black tracking-tight [font-stretch:112%]">
            NCI Logistics Control Tower
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Ingrese con su cuenta de operaciones, cliente o conductor. Su acceso
            queda registrado.
          </p>
          <div className="mt-8 rounded-3xl border border-ink/10 bg-surface p-6 shadow-[0_30px_60px_-40px_rgb(11_35_56/0.45)] sm:p-7">
            <Suspense fallback={null}>
              <LoginForm
                demoDefaults={
                  isLocalEnv()
                    ? {
                        email: "platform@nci.local",
                        password: "NCIPlatform2026!",
                      }
                    : undefined
                }
              />
            </Suspense>
          </div>
          <p className="mt-5 text-center text-xs text-ink-muted">
            ¿Problemas para entrar? Contacte a su administrador de flota.
          </p>
        </div>
      </section>
    </main>
  );
}
