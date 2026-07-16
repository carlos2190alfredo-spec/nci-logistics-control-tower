import { History } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { ExportCsvButton } from "@/components/tenant/export-csv-button";
import { requireTenantMembership } from "@/lib/server/auth";
import { getTenantClosedTrips } from "@/lib/server/tenant-dashboard-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel, tripStatusLabel, tripStatusTone } from "@/lib/ui/status";
import { formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TenantHistoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const trips = await getTenantClosedTrips(tenant.id, 100);

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
              href={`/api/t/${tenantSlug}/export/trips`}
              label="Exportar viajes"
            />
          }
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Historial" },
          ]}
          description={
            trips.length === 0
              ? "Aun no hay servicios cerrados."
              : `${trips.length} servicio(s) cerrado(s) o cancelado(s) recientes.`
          }
          title="Historial de servicios"
        />

        <Card>
          <CardHeader
            description="Servicios cerrados o cancelados."
            icon={<History />}
            title="Servicios recientes"
          />
          <div className="mt-4 overflow-x-auto">
            {trips.length ? (
              <DataTable caption="Historial de servicios cerrados">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Referencia</TableHeaderCell>
                    <TableHeaderCell>Cliente</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Programado</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {trips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-mono font-semibold text-foreground">
                        {trip.reference}
                      </TableCell>
                      <TableCell>{trip.customerAccount.name}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={tripStatusLabel[trip.status]}
                          tone={tripStatusTone[trip.status]}
                        />
                      </TableCell>
                      <TableCell numeric>{formatDateShort(trip.scheduledAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState icon={<History />} title="Aun no hay servicios cerrados" />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
