import Link from "next/link";
import { FileCheck2, KeyRound, Radar, Route, ShieldCheck } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";

const capabilities = [
  {
    icon: Radar,
    title: "Centro de control en vivo",
    description: "Solicitudes, viajes activos, incidencias y evidencias en una sola vista operativa.",
  },
  {
    icon: Route,
    title: "Trazabilidad por hitos",
    description: "Linea de tiempo de cada servicio, del origen al cierre, visible para el cliente autorizado.",
  },
  {
    icon: ShieldCheck,
    title: "Aislamiento por tenant",
    description: "Cada transportista y cada cliente ven exclusivamente su operacion, verificado en servidor.",
  },
  {
    icon: FileCheck2,
    title: "POD digital",
    description: "Evidencia fotografica, firma del receptor y prueba de entrega en PDF descargable.",
  },
];

const demoAccounts = [
  { role: "Plataforma", email: "platform@nci.local", password: "NCIPlatform2026!" },
  { role: "Operaciones", email: "operaciones@panatruck.local", password: "Operaciones2026!" },
  { role: "Conductor", email: "conductor1@panatruck.local", password: "Conductor2026!" },
  { role: "Cliente", email: "cliente@clienteportuario.local", password: "Cliente2026!" },
];

export default function HomePage() {
  return (
    <main className="control-grid min-h-screen bg-nav px-4 py-10 text-nav-foreground md:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <section className="anim-page py-6">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-nav-active">NCI Automation</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-white md:text-5xl">LOGISTICS CONTROL TOWER</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-nav-muted">
            Plataforma SaaS multicliente para operar transporte de carga: solicitudes, viajes, conductores, incidencias,
            evidencias y prueba de entrega con aislamiento total por empresa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className={buttonStyles({ variant: "accent", size: "lg" })} href="/login">
              Iniciar sesion
            </Link>
            <Link
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-nav-border px-5 text-base font-semibold text-nav-foreground transition-colors hover:bg-nav-surface"
              href="/platform"
            >
              Panel plataforma
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {capabilities.map((capability, index) => (
              <div
                className="anim-item rounded-xl border border-nav-border bg-nav-surface/50 p-4 backdrop-blur-sm"
                key={capability.title}
                style={{ "--stagger": index } as React.CSSProperties}
              >
                <capability.icon aria-hidden className="size-5 text-nav-active" />
                <h2 className="mt-3 text-sm font-bold text-white">{capability.title}</h2>
                <p className="mt-1 text-sm leading-6 text-nav-muted">{capability.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="anim-scale-in rounded-2xl border border-nav-border bg-surface p-6 text-foreground shadow-lg lg:mt-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
              <KeyRound className="size-4.5" />
            </span>
            <div>
              <h2 className="text-base font-bold">Credenciales demo</h2>
              <p className="text-xs text-muted-foreground">Entorno local de demostracion</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3">
            {demoAccounts.map((account) => (
              <li className="rounded-lg border border-border bg-surface-sunken/60 p-3" key={account.role}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{account.role}</p>
                <p className="mt-1 break-all font-mono text-[13px] text-foreground">{account.email}</p>
                <p className="break-all font-mono text-[13px] text-muted-foreground">{account.password}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-faint-foreground">
            Contraseñas exclusivas de demostracion. No usar en produccion.
          </p>
        </section>
      </div>
      <p className="mx-auto mt-12 max-w-6xl border-t border-nav-border pt-6 text-center text-xs text-nav-muted">
        Tecnologia desarrollada por NCI Automation
      </p>
    </main>
  );
}
