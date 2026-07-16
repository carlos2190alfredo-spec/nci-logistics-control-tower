import { Inbox } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { RequestCard } from "@/components/tenant/request-card";
import { requireTenantMembership } from "@/lib/server/auth";
import { getTenantRequests } from "@/lib/server/tenant-dashboard-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export default async function TenantRequestsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const requests = await getTenantRequests(tenant.id);

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
            { label: "Solicitudes" },
          ]}
          description={
            requests.length === 0
              ? "No hay solicitudes pendientes en este momento."
              : `${requests.length} solicitud(es) por atender.`
          }
          title="Solicitudes de cliente"
        />

        <Card>
          <CardHeader
            description="Nuevas solicitudes del portal por convertir en viaje."
            icon={<Inbox />}
            title="Pendientes"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {requests.length ? (
              requests.map((request, i) => (
                <RequestCard index={i} key={request.id} request={request} tenantSlug={tenantSlug} />
              ))
            ) : (
              <div className="col-span-full">
                <EmptyState
                  description="Las solicitudes creadas por sus clientes apareceran aqui."
                  icon={<Inbox />}
                  title="No hay solicitudes pendientes"
                />
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
