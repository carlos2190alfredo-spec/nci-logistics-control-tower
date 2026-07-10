import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { validateResetToken } from "@/lib/server/password-reset";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button-styles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Restablecer contrasena",
  robots: { index: false, follow: false },
};

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const validation = await validateResetToken(token);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="anim-page w-full max-w-md">
        <Link className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" href="/login">
          <ArrowLeft aria-hidden className="size-4" />
          Volver a iniciar sesion
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
          <span aria-hidden className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Restablecer contrasena</h1>
          {validation.ok ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Elija una contrasena nueva. Al confirmar, se cerraran todas las sesiones activas de su cuenta.
              </p>
              <div className="mt-6">
                <ResetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <>
              <Alert className="mt-4" tone="danger" title="Enlace no valido">
                {validation.reason === "EXPIRED"
                  ? "El enlace expiro. Solicite uno nuevo."
                  : validation.reason === "USED"
                    ? "Este enlace ya fue utilizado."
                    : "El enlace no es valido. Solicite uno nuevo."}
              </Alert>
              <Link className={buttonStyles({ variant: "secondary", className: "mt-6 w-full" })} href="/recuperar">
                Solicitar nuevo enlace
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
