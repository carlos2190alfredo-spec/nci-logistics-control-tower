import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPartialSession } from "@/lib/server/auth";
import { MfaVerifyForm } from "@/components/mfa-verify-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: "noindex, nofollow" };

export default async function MfaVerifyPage() {
  const session = await getPartialSession();
  if (!session) redirect("/login");
  if (session.authLevel !== "PARTIAL_MFA_PENDING") redirect("/login");

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="anim-page w-full max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck aria-hidden className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Verificacion requerida</p>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Autenticacion de dos factores</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Ingrese el codigo de 6 digitos de su aplicacion autenticadora para completar el inicio de sesion.
          </p>
          <div className="mt-6">
            <MfaVerifyForm />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-faint-foreground">
          ¿Perdio su dispositivo? Use un codigo de recuperacion.
        </p>
      </div>
    </main>
  );
}
