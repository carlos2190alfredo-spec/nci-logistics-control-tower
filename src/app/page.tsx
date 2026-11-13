import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { IsthmusRoute } from "@/components/brand/isthmus-route";
import { SITE_NAME, siteOpenGraph, siteTwitter } from "@/components/brand/site";
import { isLocalEnv } from "@/lib/app-env";

const pageTitle = `${SITE_NAME} · Torre de control para transporte de carga`;

// Titulo propio (absoluto, sin plantilla) y canonica relativa a metadataBase.
export const metadata: Metadata = {
  title: { absolute: pageTitle },
  alternates: { canonical: "/" },
  openGraph: siteOpenGraph({ title: pageTitle, url: "/" }),
  twitter: siteTwitter({ title: pageTitle }),
};

/*
 * Landing — direccion "Manifiesto del istmo" (docs/design/CREATIVE_DIRECTION.md).
 * Todo el contenido describe capacidades existentes del producto; sin cifras,
 * clientes ni testimonios inventados.
 */

const milestones = [
  {
    name: "Solicitud",
    text: "El cliente pide el servicio desde su portal. Operaciones lo revisa, pide información o lo rechaza con un motivo que el cliente ve.",
    who: "Cliente · Operaciones",
  },
  {
    name: "Asignación",
    text: "Vehículo, equipo y conductor se validan contra cumplimiento, mantenimiento y agenda antes de confirmar. Si algo bloquea, la pantalla dice qué.",
    who: "Operaciones",
  },
  {
    name: "En ruta",
    text: "El conductor avanza cada tramo desde su teléfono, también sin señal. Al reconectar, la cola se sincroniza sin duplicar ni pisar cambios.",
    who: "Conductor · Operaciones",
  },
  {
    name: "Entrega",
    text: "Entrega confirmada, o entrega fallida con reintento o retorno. Las incidencias que importan se comunican al cliente.",
    who: "Todos los involucrados",
  },
  {
    name: "Evidencia",
    text: "Foto y firma del receptor. Cada archivo pasa por antivirus y cuarentena antes de quedar disponible.",
    who: "Conductor · Operaciones",
  },
  {
    name: "POD",
    text: "Prueba de entrega en PDF, descargable solo por el cliente de ese servicio.",
    who: "Cliente",
  },
];

const views = [
  {
    role: "Operaciones",
    text: "Centro de control con solicitudes, viajes activos, asignación validada, excepciones con motivo y cumplimiento panameño: documentos con vencimiento, contenedores con días libres y mercancía peligrosa.",
  },
  {
    role: "Clientes",
    text: "Portal propio para solicitar transporte, seguir cada hito autorizado, ver incidencias comunicadas y descargar sus pruebas de entrega.",
  },
  {
    role: "Conductores",
    text: "Aplicación instalable que funciona sin conexión: avance por tramos, captura de evidencia y sincronización segura al volver la señal.",
  },
];

const controls = [
  [
    "Aislamiento por empresa",
    "Cada consulta se filtra por la empresa de la ruta y una membresía verificada en el servidor.",
  ],
  [
    "MFA para cuentas críticas",
    "Propietarios y administradores de empresa, y el personal de plataforma, entran con contraseña y código TOTP.",
  ],
  [
    "Archivos en cuarentena",
    "Ningún archivo se sirve hasta que el antivirus lo declara limpio.",
  ],
  [
    "Bitácora de auditoría",
    "Asignaciones, cambios de estado, excepciones y accesos quedan registrados con su autor.",
  ],
];

const demoAccounts = [
  {
    role: "Plataforma",
    email: "platform@nci.local",
    password: "NCIPlatform2026!",
  },
  {
    role: "Operaciones",
    email: "operaciones@panatruck.local",
    password: "Operaciones2026!",
  },
  {
    role: "Conductor",
    email: "conductor1@panatruck.local",
    password: "Conductor2026!",
  },
  {
    role: "Cliente",
    email: "cliente@clienteportuario.local",
    password: "Cliente2026!",
  },
];

const chapters = [
  { id: "recorrido", label: "Recorrido" },
  { id: "vistas", label: "Vistas" },
  { id: "control", label: "Control" },
];

function Numeral({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={`font-mono text-xs font-bold tracking-[0.18em] ${className ?? ""}`}
    >
      {String(value).padStart(2, "0")}
    </span>
  );
}

export default function HomePage() {
  // Credenciales demo solo en local: en staging el repo publico las haria validas para cualquiera.
  const showDemoAccounts = isLocalEnv();

  return (
    <div className="bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link className="flex items-baseline gap-2" href="/">
            <span className="font-display text-lg font-black tracking-tight [font-stretch:125%]">
              NCI
            </span>
            <span className="hidden font-mono text-[11px] tracking-[0.2em] text-ink-muted sm:inline">
              LOGISTICS CONTROL TOWER
            </span>
          </Link>
          <nav
            aria-label="Capítulos"
            className="hidden items-center gap-6 md:flex"
          >
            {chapters.map((chapter, index) => (
              <a
                className="group flex items-baseline gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
                href={`#${chapter.id}`}
                key={chapter.id}
              >
                <Numeral className="text-signal-strong" value={index + 1} />
                {chapter.label}
              </a>
            ))}
          </nav>
          <Link
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-ink px-4 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
            href="/login"
          >
            Entrar
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </div>
      </header>

      <main>
        {/* Hero: manifiesto a la izquierda, cruce del istmo a la derecha */}
        <section className="mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-16 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pt-20 lg:pb-24">
          <div className="anim-page">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.22em] text-ink-muted">
              <span className="inline-block size-2 rounded-full bg-signal" />
              MANIFIESTO DE OPERACIÓN
              <span className="text-ink/30">/</span>
              PANAMÁ
            </p>
            <h1 className="mt-6">
              <span className="block font-mono text-xs font-bold tracking-[0.3em] text-signal">
                LOGISTICS CONTROL TOWER
              </span>
              <span className="mt-4 block font-display text-[clamp(2rem,10vw,4rem)] leading-[0.92] font-black tracking-[-0.02em] text-balance [font-stretch:112%] max-sm:[overflow-wrap:anywhere] lg:text-[clamp(2.6rem,6.4vw,5.4rem)]">
                Cada carga, documentada de origen a entrega.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted">
              Plataforma multiempresa para transportistas de carga: solicitudes,
              asignación de flota, avance del conductor, incidencias y prueba de
              entrega digital. Cada hito queda registrado y visible solo para
              quien corresponde.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex min-h-13 items-center gap-2 rounded-full bg-signal px-7 text-base font-semibold text-white shadow-[0_10px_30px_-12px_rgb(194_65_12/0.7)] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-signal-strong focus-visible:-translate-y-0.5"
                href="/login"
              >
                Iniciar sesion
                <ArrowRight aria-hidden className="size-4.5" />
              </Link>
              <a
                className="inline-flex min-h-13 items-center px-3 text-base font-semibold underline decoration-ink/30 underline-offset-[6px] transition-colors hover:decoration-signal"
                href="#recorrido"
              >
                Ver el recorrido de un servicio
              </a>
            </div>
            <dl className="mt-12 grid max-w-xl grid-cols-3 border-t border-ink/15 pt-5">
              {[
                ["Empresas", "aisladas"],
                ["Conductor", "sin señal"],
                ["Evidencia", "escaneada"],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-mono text-[11px] tracking-[0.16em] text-ink-muted">
                    {term.toUpperCase()}
                  </dt>
                  <dd className="mt-1 font-display text-base font-bold [font-stretch:110%] sm:text-lg">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <figure className="anim-scale-in relative overflow-hidden rounded-[28px] bg-ink p-4 shadow-[0_40px_80px_-40px_rgb(11_35_56/0.6)] sm:p-6">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-fog">
              <span>RUTA DEMO</span>
              <span>MIT → BALBOA</span>
            </div>
            <IsthmusRoute className="mt-3 w-full" />
            <figcaption className="mt-3 border-t border-fog/15 pt-3 text-sm leading-6 text-fog">
              Del Atlántico al Pacífico: los seis hitos que todo servicio sella
              antes de cerrarse.
            </figcaption>
          </figure>
        </section>

        {/* 01 — Recorrido */}
        <section className="scroll-mt-16 border-t border-ink/10" id="recorrido">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Numeral className="text-signal-strong" value={1} />
              <h2 className="mt-3 font-display text-4xl leading-none font-black tracking-tight text-balance [font-stretch:115%] md:text-5xl">
                Un servicio, seis hitos sellados.
              </h2>
              <p className="mt-5 max-w-md leading-7 text-ink-muted">
                El mismo registro sirve a operaciones, al conductor y al
                cliente. Cada uno ve lo que le corresponde, nada más.
              </p>
            </div>
            <ol className="border-t border-ink">
              {milestones.map((milestone, index) => (
                <li
                  className="group grid grid-cols-[3rem_1fr] gap-x-4 gap-y-2 border-b border-ink/15 py-6 sm:grid-cols-[3.5rem_1fr_10rem]"
                  key={milestone.name}
                >
                  <span className="grid size-11 place-items-center rounded-full border border-dashed border-signal font-mono text-xs font-bold text-signal transition-colors duration-200 group-hover:border-solid group-hover:bg-signal group-hover:text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-bold [font-stretch:110%]">
                      {milestone.name}
                    </h3>
                    <p className="mt-1.5 leading-7 text-ink-muted">
                      {milestone.text}
                    </p>
                  </div>
                  <p className="col-start-2 font-mono text-[11px] tracking-[0.12em] text-ink-muted sm:col-start-3 sm:pt-1.5 sm:text-right">
                    {milestone.who.toUpperCase()}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 02 — Vistas */}
        <section className="scroll-mt-16 bg-paper-deep" id="vistas">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Numeral className="text-signal-strong" value={2} />
                <h2 className="mt-3 max-w-2xl font-display text-4xl leading-none font-black tracking-tight text-balance [font-stretch:115%] md:text-5xl">
                  Tres vistas de la misma operación.
                </h2>
              </div>
              <p className="max-w-sm leading-7 text-ink-muted">
                Un solo dato, tres responsabilidades distintas.
              </p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-ink/15 bg-ink/15 lg:grid-cols-[1.25fr_1fr_1fr]">
              {views.map((view, index) => (
                <article
                  className={`bg-paper p-7 md:p-9 ${index === 0 ? "lg:row-span-1" : ""}`}
                  key={view.role}
                >
                  <p className="font-mono text-[11px] tracking-[0.2em] text-signal">
                    VISTA {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3
                    className={`mt-4 font-display font-black tracking-tight break-words [font-stretch:115%] ${index === 0 ? "text-2xl sm:text-4xl" : "text-2xl sm:text-3xl"}`}
                  >
                    {view.role}
                  </h3>
                  <p className="mt-4 leading-7 text-ink-muted">{view.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 03 — Control */}
        <section className="scroll-mt-16 bg-ink text-paper" id="control">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <Numeral className="text-signal-on-ink" value={3} />
              <h2 className="mt-3 font-display text-4xl leading-none font-black tracking-tight text-balance [font-stretch:115%] md:text-5xl">
                Control que se verifica en el servidor, no en la pantalla.
              </h2>
              <p className="mt-5 max-w-md leading-7 text-fog">
                Ocultar un botón no es seguridad. Permisos, aislamiento y
                validaciones se verifican en el servidor en cada consulta, a
                partir de la ruta, la sesión y una membresía comprobada.
              </p>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-3xl bg-fog/15 sm:grid-cols-2">
              {controls.map(([title, text]) => (
                <div className="bg-ink p-6" key={title}>
                  <dt className="font-display text-lg font-bold [font-stretch:110%]">
                    {title}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-fog">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {showDemoAccounts ? (
          <section
            aria-labelledby="demo-title"
            className="border-t border-ink/10"
          >
            <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
              <h2
                className="font-mono text-xs font-bold tracking-[0.2em] text-signal"
                id="demo-title"
              >
                CREDENCIALES DEMO · SOLO ENTORNO LOCAL
              </h2>
              <ul className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-ink/15 bg-ink/15 sm:grid-cols-2 lg:grid-cols-4">
                {demoAccounts.map((account) => (
                  <li className="bg-paper p-4" key={account.role}>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                      {account.role}
                    </p>
                    <p className="mt-1 break-all font-mono text-[13px]">
                      {account.email}
                    </p>
                    <p className="break-all font-mono text-[13px] text-ink-muted">
                      {account.password}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="border-t border-ink/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-16 md:px-8">
            <p className="max-w-2xl font-display text-3xl leading-tight font-black tracking-tight text-balance [font-stretch:112%] md:text-4xl">
              Su operación ya tiene manifiesto. Ahora también tiene torre de
              control.
            </p>
            <Link
              className="inline-flex min-h-13 items-center gap-2 rounded-full bg-ink px-7 text-base font-semibold text-paper transition-colors hover:bg-ink-soft"
              href="/login"
            >
              Acceder a la plataforma
              <ArrowRight aria-hidden className="size-4.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-muted md:px-8">
          <p>Tecnología desarrollada por NCI Automation</p>
          <p className="font-mono tracking-[0.14em]">NCI · LCT</p>
        </div>
      </footer>
    </div>
  );
}
