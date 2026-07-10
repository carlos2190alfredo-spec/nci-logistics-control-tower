import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { RequestResetForm } from "@/components/auth/request-reset-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recuperar contrasena",
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="anim-page w-full max-w-md">
        <Link className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" href="/login">
          <ArrowLeft aria-hidden className="size-4" />
          Volver a iniciar sesion
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
          <span aria-hidden className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <MailCheck className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Recuperar contrasena</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingrese el correo asociado a su cuenta. Si existe, le enviaremos un enlace para restablecer la contrasena.
          </p>
          <div className="mt-6">
            <RequestResetForm />
          </div>
        </div>
      </div>
    </main>
  );
}
