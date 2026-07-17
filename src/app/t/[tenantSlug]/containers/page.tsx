import Link from "next/link";
import { Container as ContainerIcon, Clock, TriangleAlert, Boxes, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  Collapsible,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextArea,
} from "@/components/ui";
import { ExportCsvButton } from "@/components/tenant/export-csv-button";
import { requireTenantRole } from "@/lib/server/auth";
import { getContainers, summarizeContainers } from "@/lib/server/container-data";
import { createContainerAction } from "@/lib/server/container-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
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
  const canManage = hasPermission(membership.role, "tenant.containers.manage");

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
              href={`/api/t/${tenantSlug}/export/containers`}
              label="Exportar contenedores"
            />
          }
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

        {canManage ? (
          <Collapsible icon={<Plus />} summary="Registrar contenedor" tone="default">
            <form
              action={createContainerAction.bind(null, tenantSlug)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Field label="Referencia" name="reference" placeholder="EMPRESA-CT-0001" required />
              <SelectField label="Operación" name="operationType">
                <option value="IMPORTACION">Importación</option>
                <option value="EXPORTACION">Exportación</option>
                <option value="TRANSITO">Tránsito</option>
                <option value="REEXPORTACION">Reexportación</option>
                <option value="MOVIMIENTO_NACIONAL">Movimiento nacional</option>
              </SelectField>
              <SelectField label="Tamaño" name="size">
                <option value="S40">40&apos;</option>
                <option value="S20">20&apos;</option>
                <option value="S45">45&apos;</option>
                <option value="OTRO">Otro</option>
              </SelectField>
              <SelectField label="Tipo" name="type">
                <option value="SECO">Seco</option>
                <option value="REFRIGERADO">Refrigerado</option>
                <option value="OPEN_TOP">Open top</option>
                <option value="FLAT_RACK">Flat rack</option>
                <option value="TANQUE">Tanque</option>
                <option value="ESPECIAL">Especial</option>
              </SelectField>
              <Field label="Número de contenedor" name="containerNumber" placeholder="MSCU1234567" required={false} />
              <Field label="Naviera" name="shippingLine" placeholder="MSC" required={false} />
              <Field label="Terminal" name="terminal" placeholder="MIT" required={false} />
              <Field label="Booking" name="booking" required={false} />
              <Field label="Sello" name="sealNumber" required={false} />
              <Field help="Días libres pactados para demurrage/detention." label="Días libres" name="freeDays" required={false} type="number" />
              <Field label="Fecha límite de devolución" name="returnDeadline" required={false} type="date" />
              <div className="sm:col-span-2">
                <TextArea label="Observaciones" name="notes" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Registrar contenedor</SubmitButton>
              </div>
            </form>
          </Collapsible>
        ) : null}

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
                        <Link
                          className="font-mono font-semibold text-primary hover:underline"
                          href={`/t/${tenantSlug}/containers/${c.id}`}
                        >
                          {c.reference}
                        </Link>
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
