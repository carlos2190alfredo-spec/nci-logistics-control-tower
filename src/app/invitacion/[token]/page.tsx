import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button-styles";
import { DefinitionList } from "@/components/ui/definition-list";
import { getApiSessionUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { lookupInvitation } from "@/lib/server/invitation-accept";
import { loginPathForInvitation } from "@/lib/server/next-path";
import { INVITATION_FAILURE_MESSAGE } from "@/lib/ui/invitation-notices";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invitación al equipo",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sessionUser = await getApiSessionUser();
  const lookup = await lookupInvitation(getDb(), token, sessionUser?.id ?? null);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="anim-page w-full max-w-md">
        <Link className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" href="/login">
          <ArrowLeft aria-hidden className="size-4" />
          Ir a iniciar sesión
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
          <span aria-hidden className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <UserPlus className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Invitación al equipo</h1>

          {lookup.ok ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {lookup.invitation.invitedByName} le invita a unirse a <strong className="text-foreground">{lookup.invitation.tenantName}</strong> en NCI Logistics Control Tower.
              </p>
              <DefinitionList
                className="mt-4"
                items={[
                  { term: "Correo", description: lookup.invitation.email },
                  { term: "Rol", description: tenantRoleLabel[lookup.invitation.role] ?? lookup.invitation.role },
                ]}
              />
              <div className="mt-6">
                {lookup.invitation.plan.action === "CREATE_ACCOUNT" ? (
                  <AcceptInvitationForm mode="create" token={token} />
                ) : lookup.invitation.plan.action === "JOIN_EXISTING" ? (
                  <AcceptInvitationForm mode="join" token={token} />
                ) : (
                  <>
                    <Alert tone="warning" title="Falta un paso">
                      {INVITATION_FAILURE_MESSAGE[lookup.invitation.plan.action]}
                    </Alert>
                    {lookup.invitation.plan.action !== "UNAVAILABLE" ? (
                      <Link className={buttonStyles({ variant: "secondary", className: "mt-4 w-full" })} href={loginPathForInvitation(token)}>
                        Iniciar sesión
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <Alert className="mt-4" tone="danger" title="Enlace no válido">
              {INVITATION_FAILURE_MESSAGE[lookup.reason]}
            </Alert>
          )}
        </div>
      </div>
    </main>
  );
}
