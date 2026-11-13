import { TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { IncidentCard } from "@/components/tenant/incident-card";
import { ExportCsvButton } from "@/components/tenant/export-csv-button";
import { requireTenantPermission } from "@/lib/server/auth";
import { getTenantIncidents } from "@/lib/server/tenant-dashboard-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

export default async function TenantIncidentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.view");
  const incidents = await getTenantIncidents({ tenantId: tenant.id, role: membership.role }, 100);

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          actions={
            <ExportCsvButton
              href={`/api/t/${tenantSlug}/export/incidents`}
              label="Exportar incidencias"
            />
          }
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Incidencias" },
          ]}
          description={
            incidents.length === 0
              ? "La operacion no registra novedades."
              : `${incidents.length} incidencia(s) abierta(s).`
          }
          title="Incidencias"
        />

        <Card>
          <CardHeader
            description="Reportes internos y visibles al cliente."
            icon={<TriangleAlert />}
            title="Incidencias abiertas"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {incidents.length ? (
              incidents.map((incident) => <IncidentCard incident={incident} key={incident.id} />)
            ) : (
              <div className="col-span-full">
                <EmptyState
                  description="Todas las incidencias han sido resueltas."
                  icon={<TriangleAlert />}
                  title="Sin incidencias"
                />
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
