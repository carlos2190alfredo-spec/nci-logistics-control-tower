import Link from "next/link";
import { Card } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0f2d46] px-4 py-10 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="py-10">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-300">NCI Automation</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-tight">LOGISTICS CONTROL TOWER</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-blue-100">
            Plataforma SaaS multicliente local para controlar solicitudes, viajes, conductores, clientes, incidencias, evidencias y trazabilidad demo con aislamiento por tenant desde la base de datos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-md bg-orange-500 px-5 py-3 font-semibold text-white" href="/login">
              Iniciar sesion
            </Link>
            <Link className="rounded-md border border-white/40 px-5 py-3 font-semibold" href="/platform">
              Panel plataforma
            </Link>
          </div>
        </section>
        <Card className="bg-white text-slate-950">
          <h2 className="text-xl font-bold">Credenciales demo</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <p><strong>Plataforma:</strong> platform@nci.local / NCIPlatform2026!</p>
            <p><strong>Operaciones:</strong> operaciones@panatruck.local / Operaciones2026!</p>
            <p><strong>Conductor:</strong> conductor1@panatruck.local / Conductor2026!</p>
            <p><strong>Cliente:</strong> cliente@clienteportuario.local / Cliente2026!</p>
          </div>
          <p className="mt-5 text-xs text-slate-500">Contraseñas exclusivas de demostracion. No usar en produccion.</p>
        </Card>
      </div>
    </main>
  );
}
