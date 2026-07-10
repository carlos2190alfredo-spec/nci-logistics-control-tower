import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { getCurrentSession, requireAuthenticatedUser } from "@/lib/server/auth";
import { listUserSessions } from "@/lib/server/session-management";
import { revokeAllSessionsAction, revokeOtherSessionsAction, revokeSessionAction } from "@/lib/server/session-actions";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sesiones activas",
  robots: { index: false, follow: false },
};

export default async function ActiveSessionsPage() {
  const user = await requireAuthenticatedUser();
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  const sessions = await listUserSessions(user.id, current.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="anim-page grid gap-6">
        <header className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint-foreground">Cuenta</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ShieldCheck aria-hidden className="size-5 text-primary" />
            Sesiones activas
          </h1>
          <p className="text-sm text-muted-foreground">
            Estas son las sesiones abiertas en su cuenta. Cierre las que no reconozca.
          </p>
        </header>

        <Card className="grid gap-3">
          {sessions.map((session) => (
            <div
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              data-testid={`session-row-${session.id}`}
              key={session.id}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Smartphone aria-hidden className="size-4 text-muted-foreground" />
                  {session.userAgentShort}
                  {session.isCurrent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-strong">
                      Sesion actual
                    </span>
                  ) : null}
                </p>
                <dl className="mt-1 grid gap-y-0.5 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <dt>Creada:</dt>
                    <dd className="tabular-nums">{formatDate(session.createdAt)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Ultima actividad:</dt>
                    <dd className="tabular-nums">{session.lastSeenAt ? formatDate(session.lastSeenAt) : "Sin registro"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Expira:</dt>
                    <dd className="tabular-nums">{formatDate(session.expiresAt)}</dd>
                  </div>
                </dl>
              </div>
              <form action={revokeSessionAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <SubmitButton variant="outline">
                  <LogOut aria-hidden className="size-4" />
                  {session.isCurrent ? "Cerrar esta sesion" : "Cerrar sesion"}
                </SubmitButton>
              </form>
            </div>
          ))}
        </Card>

        <Card className="grid gap-3">
          <h2 className="text-base font-bold text-foreground">Acciones globales</h2>
          <p className="text-sm text-muted-foreground">
            Si sospecha que su cuenta fue comprometida, cierre todas las sesiones y cambie su contrasena.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={revokeOtherSessionsAction}>
              <SubmitButton variant="secondary">Cerrar todas las demas</SubmitButton>
            </form>
            <form action={revokeAllSessionsAction}>
              <SubmitButton variant="danger">Cerrar todas las sesiones</SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
