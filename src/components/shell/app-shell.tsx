import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { ShellChrome, type ShellNavGroup } from "@/components/shell/shell-chrome";

/**
 * Shell de aplicación autenticada (plataforma, tenant y portal cliente):
 * skip link, banner de soporte auditado, sidebar por perfil y topbar.
 */
export function AppShell({
  children,
  brandName,
  brandContext,
  navGroups,
  user,
  supportMode = false,
  topExtra,
}: {
  children: ReactNode;
  brandName: string;
  brandContext: string;
  navGroups: ShellNavGroup[];
  user: { name: string; role: string };
  supportMode?: boolean;
  topExtra?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <a
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#contenido-principal"
      >
        Saltar al contenido principal
      </a>
      {supportMode ? (
        <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm font-semibold text-white" role="status">
          <ShieldAlert aria-hidden className="size-4 shrink-0" />
          Modo soporte de NCI Automation activo. Toda accion queda auditada.
        </div>
      ) : null}
      <ShellChrome brandContext={brandContext} brandName={brandName} navGroups={navGroups} topExtra={topExtra} user={user}>
        {children}
      </ShellChrome>
    </div>
  );
}
