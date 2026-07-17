import { Container as ContainerIcon, Clock, TriangleAlert, Boxes } from "lucide-react";
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
import { requireTenantRole } from "@/lib/server/auth";
import { getContainers, summarizeContainers } from "@/lib/server/container-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  containerOperationLabel,
  containerSizeLabel,
  containerStatusLabel,
  containerStatusTone,
  containerTypeLabel,
  freeTimeRiskLabel,
  freeTimeRiskTone,
} from "@/lib/ui/containers";
import { formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContainersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "SAFETY_MANAGER",
  ]);

  const containers = await getContainers(tenant.id);
  const counts = summarizeContainers(containers);

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
            { label: "Contenedores" },
          ]}
          description="Ciclo de vida de contenedores y control de tiempos (demurrage/detention)."
          title="Contenedores"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader icon={<Boxes />} title="Total" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.total}</p>
          </Card>
          <Card>
            <CardHeader icon={<ContainerIcon />} title="Activos" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.active}</p>
          </Card>
          <Card>
            <CardHeader icon={<Clock />} title="En riesgo de cargo" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.atRisk}</p>
          </Card>
          <Card>
            <CardHeader icon={<TriangleAlert />} title="Cargo acumulándose" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.accruing}</p>
          </Card>
        </div>

        <Card>
          <CardHeader description="Contenedores registrados y su estado." icon={<Boxes />} title="Listado" />
          <div className="mt-4 overflow-x-auto">
            {containers.length ? (
              <DataTable caption="Contenedores">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Referencia</TableHeaderCell>
                    <TableHeaderCell>Operación</TableHeaderCell>
                    <TableHeaderCell>Equipo</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Tiempo libre</TableHeaderCell>
                    <TableHeaderCell>Devolución</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {containers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="font-mono font-semibold text-foreground">{c.reference}</span>
                        {c.containerNumber ? (
                          <span className="block text-xs text-muted-foreground">{c.containerNumber}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{containerOperationLabel[c.operationType]}</TableCell>
                      <TableCell>
                        {containerSizeLabel[c.size]} · {containerTypeLabel[c.type]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={containerStatusLabel[c.status]} tone={containerStatusTone[c.status]} />
                      </TableCell>
                      <TableCell>
                        {c.freeTime ? (
                          <>
                            <StatusBadge
                              label={freeTimeRiskLabel[c.freeTime.risk]}
                              tone={freeTimeRiskTone[c.freeTime.risk]}
                            />
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {c.freeTime.chargeableDays > 0
                                ? `${c.freeTime.chargeableDays} d facturable(s)`
                                : `${c.freeTime.freeDaysRemaining} d libres`}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell numeric>
                        {c.returnDeadline ? formatDateShort(c.returnDeadline) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                description="Registre operaciones de contenedores para controlar liberación, retiro, entrega y devolución de vacío."
                icon={<Boxes />}
                title="Sin contenedores registrados"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
