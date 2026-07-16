import { Bell } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ActivityItem } from "@/components/tenant/activity-item";
import { requireTenantMembership } from "@/lib/server/auth";
import { getTenantNotifications } from "@/lib/server/tenant-dashboard-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export default async function TenantActivityPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const notifications = await getTenantNotifications(tenant.id, 100);

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Actividad" },
          ]}
          description={
            notifications.length === 0
              ? "Aun no se han emitido notificaciones."
              : `${notifications.length} notificacion(es) recientes.`
          }
          title="Actividad reciente"
        />

        <Card>
          <CardHeader
            description="Notificaciones emitidas por la plataforma (portal, correo, WhatsApp mock)."
            icon={<Bell />}
            title="Historial de notificaciones"
          />
          <div className="mt-4 grid gap-1">
            {notifications.length ? (
              notifications.map((n) => <ActivityItem key={n.id} notification={n} />)
            ) : (
              <EmptyState icon={<Bell />} title="Sin actividad reciente" />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
