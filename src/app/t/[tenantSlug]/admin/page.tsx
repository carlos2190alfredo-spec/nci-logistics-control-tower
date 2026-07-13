import { Building2, MessageSquare, Route, Truck, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { MetricCard, PageHeader } from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantAdminPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const db = getDb();
  const [memberCount, driverCount, tripCount, feedbackCount, pendingInvitations] = await Promise.all([
    db.tenantMembership.count({ where: { tenantId: tenant.id, active: true } }),
    db.driver.count({ where: { tenantId: tenant.id } }),
    db.trip.count({ where: { tenantId: tenant.id } }),
    db.tenantFeedback.count({ where: { tenantId: tenant.id } }),
    db.userInvitation.count({ where: { tenantId: tenant.id, usedAt: null, expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <AppShell
      brandContext={tenant.name}
      brandName="Administracion"
      navGroups={getTenantAdminNavGroups(tenantSlug)}
      user={{ name: user.name, role: "Administrador" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Administracion" }]}
          description="Panel de administracion del tenant."
          title={`Administracion — ${tenant.name}`}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<Users />} label="Miembros" value={memberCount} />
          <MetricCard icon={<Truck />} label="Conductores" value={driverCount} />
          <MetricCard icon={<Route />} label="Viajes totales" value={tripCount} />
          <MetricCard icon={<MessageSquare />} label="Feedback enviado" value={feedbackCount} />
          <MetricCard
            icon={<Building2 />}
            label="Invitaciones pendientes"
            tone={pendingInvitations > 0 ? "warning" : "default"}
            value={pendingInvitations}
          />
        </div>
      </div>
    </AppShell>
  );
}
