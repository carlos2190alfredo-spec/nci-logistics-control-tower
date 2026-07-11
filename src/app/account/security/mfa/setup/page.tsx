import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { userHasMfaActive } from "@/lib/server/mfa";
import { MfaSetupFlow } from "@/components/mfa-setup-flow";
import { MfaManagePanel } from "@/components/mfa-manage-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configurar autenticacion de dos factores",
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage() {
  const user = await requireAuthenticatedUser();
  const hasMfa = await userHasMfaActive(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="anim-page grid gap-6">
        <header className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint-foreground">Seguridad</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ShieldCheck aria-hidden className="size-5 text-primary" />
            {hasMfa ? "Administrar autenticacion de dos factores" : "Configurar autenticacion de dos factores"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasMfa
              ? "Su cuenta esta protegida con un segundo factor. Puede desactivarlo o regenerar codigos de recuperacion."
              : "Proteja su cuenta con un codigo temporal generado por una aplicacion autenticadora."}
          </p>
        </header>

        {hasMfa ? <MfaManagePanel /> : <MfaSetupFlow userEmail={user.email} />}
      </div>
    </main>
  );
}
