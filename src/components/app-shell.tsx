import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/server/actions";

export function AppShell({
  children,
  title,
  subtitle,
  nav,
  supportMode = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  nav?: ReactNode;
  supportMode?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      {supportMode ? (
        <div className="bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white">
          Modo soporte de NCI Automation activo. Toda accion queda auditada.
        </div>
      ) : null}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              NCI Logistics Control Tower
            </Link>
            <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nav}
            <form action={logoutAction}>
              <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" type="submit">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
