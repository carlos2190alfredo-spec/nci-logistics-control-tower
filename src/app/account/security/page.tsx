import Link from "next/link";
import { ShieldCheck, Key, Smartphone, ArrowRight, AlertTriangle } from "lucide-react";
import { requireAuthenticatedUser, requiresMfaForRole } from "@/lib/server/auth";
import { userHasMfaActive, getRemainingRecoveryCodes } from "@/lib/server/mfa";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seguridad de la cuenta",
  robots: { index: false, follow: false },
};

export default async function AccountSecurityPage() {
  const user = await requireAuthenticatedUser();
  const hasMfa = await userHasMfaActive(user.id);
  const mfaRequired = await requiresMfaForRole(user.id);
  const remainingCodes = hasMfa ? await getRemainingRecoveryCodes(user.id) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="anim-page grid gap-6">
        <header className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint-foreground">Cuenta</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ShieldCheck aria-hidden className="size-5 text-primary" />
            Seguridad de la cuenta
          </h1>
          <p className="text-sm text-muted-foreground">
            Administre la autenticacion de dos factores y la seguridad de su cuenta.
          </p>
        </header>

        {mfaRequired && !hasMfa ? (
          <Card className="border-warning bg-warning-soft/30">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-strong" />
              <div>
                <p className="font-semibold text-foreground">Autenticacion de dos factores obligatoria</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Su rol requiere activar la autenticacion de dos factores para continuar usando la plataforma.
                </p>
                <Link
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                  href="/account/security/mfa/setup"
                >
                  Configurar ahora
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone aria-hidden className="size-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Autenticacion de dos factores (TOTP)</p>
                <p className="text-sm text-muted-foreground">
                  {hasMfa ? "Activada — su cuenta esta protegida con un segundo factor." : "No configurada."}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${hasMfa ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}
              data-testid="mfa-status-badge"
            >
              {hasMfa ? "Activa" : "Inactiva"}
            </span>
          </div>

          {hasMfa ? (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key aria-hidden className="size-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Codigos de recuperacion</span>
                </div>
                <span
                  className={`text-sm font-semibold ${remainingCodes <= 2 ? "text-danger" : "text-foreground"}`}
                  data-testid="recovery-codes-count"
                >
                  {remainingCodes} restantes
                </span>
              </div>
              {remainingCodes <= 2 ? (
                <p className="mt-2 text-xs text-danger">
                  Tiene pocos codigos de recuperacion. Considere regenerarlos.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {hasMfa ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                href="/account/security/mfa/setup"
              >
                Administrar MFA
              </Link>
            ) : (
              <Link
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                href="/account/security/mfa/setup"
              >
                Activar autenticacion de dos factores
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </Card>

        <Card className="grid gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck aria-hidden className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Sesiones activas</p>
              <p className="text-sm text-muted-foreground">
                Vea y administre las sesiones abiertas en su cuenta.
              </p>
            </div>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            href="/account/sessions"
          >
            Ver sesiones activas
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Card>
      </div>
    </main>
  );
}
