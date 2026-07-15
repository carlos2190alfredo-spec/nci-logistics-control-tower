import Link from "next/link";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { verifyEmailToken } from "@/lib/server/email-verification";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verificacion de correo — NCI Logistics Control Tower",
  robots: { index: false },
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verifyEmailToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="anim-page w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
          {result.ok ? (
            <div className="grid gap-5 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle aria-hidden className="size-8 text-success-strong" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Correo verificado</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Su direccion de correo ha sido confirmada exitosamente.
                  Ya puede iniciar sesion en la plataforma.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck aria-hidden className="mt-0.5 size-5 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">
                      Configure la autenticacion de dos factores
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Despues de iniciar sesion, vaya a <strong>Seguridad</strong> en su perfil
                      para activar MFA con una aplicacion autenticadora (Google Authenticator, Authy).
                      Esto protege su cuenta con un segundo factor de verificacion.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                href="/login"
              >
                Iniciar sesion
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger-soft">
                <XCircle aria-hidden className="size-8 text-danger-strong" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Verificacion fallida</h1>
                <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
              </div>
              <Link
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                href="/login"
              >
                Volver al inicio
              </Link>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Tecnologia de NCI Automation
        </p>
      </div>
    </main>
  );
}
