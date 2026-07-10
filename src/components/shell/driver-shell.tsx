import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/server/actions";
import { BrandMark } from "@/components/ui/brand";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";

/**
 * Shell del conductor: móvil primero, sin sidebar, alto contraste,
 * indicador real de conectividad y mínima carga administrativa.
 */
export function DriverShell({
  children,
  tenantName,
  title,
  user,
  topNav,
  logoutSlot,
}: {
  children: ReactNode;
  tenantName: string;
  title: string;
  user: { name: string };
  topNav?: ReactNode;
  logoutSlot?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <a
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#contenido-principal"
      >
        Saltar al contenido principal
      </a>
      <header className="sticky top-0 z-20 bg-nav text-nav-foreground shadow-md">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4">
          <BrandMark name={tenantName} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-white">{title}</h1>
            <p className="truncate text-xs text-nav-muted">{user.name}</p>
          </div>
          <ConnectivityIndicator />
          {logoutSlot ?? (
            <form action={logoutAction}>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-nav-border px-3 text-sm font-semibold text-nav-foreground transition-colors hover:bg-nav-surface"
                type="submit"
              >
                <LogOut aria-hidden className="size-4" />
                Salir
              </button>
            </form>
          )}
        </div>
        {topNav ? <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-3">{topNav}</div> : null}
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-16" id="contenido-principal">
        {children}
      </main>
    </div>
  );
}
