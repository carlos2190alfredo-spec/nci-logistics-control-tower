import { notFound } from "next/navigation";
import { ArrowRight, Boxes, DollarSign, Plus } from "lucide-react";
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
import { requireTenantRole } from "@/lib/server/auth";
import { getContainerDetail } from "@/lib/server/container-data";
import {
  addContainerChargeAction,
  setContainerReleaseAction,
  transitionContainerAction,
} from "@/lib/server/container-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { nextContainerStatuses } from "@/lib/containers/lifecycle";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  containerChargeLabel,
  containerOperationLabel,
  containerSizeLabel,
  containerStatusLabel,
  containerStatusTone,
  containerTypeLabel,
  freeTimeRiskLabel,
  freeTimeRiskTone,
} from "@/lib/ui/containers";
import { formatDate, formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; containerId: string }>;
}) {
  const { tenantSlug, containerId } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "SAFETY_MANAGER",
  ]);

  const container = await getContainerDetail(tenant.id, containerId);
  if (!container) notFound();

  const canManage = hasPermission(membership.role, "tenant.containers.manage");
  const nextStates = nextContainerStatuses(container.status);

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
            { label: "Contenedores", href: `/t/${tenantSlug}/containers` },
            { label: container.reference },
          ]}
          description={`${containerOperationLabel[container.operationType]} · ${containerSizeLabel[container.size]} ${containerTypeLabel[container.type]}`}
          meta={<StatusBadge label={containerStatusLabel[container.status]} tone={containerStatusTone[container.status]} />}
          title={container.reference}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader description="Datos de la operación." icon={<Boxes />} title="Detalle" />
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ["Contenedor", container.containerNumber],
                  ["Naviera", container.shippingLine],
                  ["Terminal", container.terminal],
                  ["Booking", container.booking],
                  ["BL", container.billOfLading],
                  ["Sello", container.sealNumber],
                  ["Días libres", container.freeDays != null ? String(container.freeDays) : null],
                  ["Gate-in", container.gateInAt ? formatDate(container.gateInAt) : null],
                  ["Gate-out", container.gateOutAt ? formatDate(container.gateOutAt) : null],
                  ["Vacío devuelto", container.emptyReturnedAt ? formatDate(container.emptyReturnedAt) : null],
                  ["Devolución límite", container.returnDeadline ? formatDate(container.returnDeadline) : null],
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-2 border-b border-border py-1.5 sm:block sm:border-0" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-foreground">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {container.freeTime ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken/70 px-3 py-2.5 text-sm">
                  <StatusBadge label={freeTimeRiskLabel[container.freeTime.risk]} tone={freeTimeRiskTone[container.freeTime.risk]} />
                  <span className="text-muted-foreground">
                    {container.freeTime.chargeableDays > 0
                      ? `${container.freeTime.chargeableDays} día(s) facturable(s)`
                      : `${container.freeTime.freeDaysRemaining} día(s) libre(s) restantes`}
                  </span>
                </div>
              ) : null}
            </Card>

            <Card>
              <CardHeader description="Cargos por tiempo (demurrage, detention, almacenaje…)." icon={<DollarSign />} title="Cargos" />
              <div className="mt-4 overflow-x-auto">
                {container.charges.length ? (
                  <DataTable caption="Cargos del contenedor">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Tipo</TableHeaderCell>
                        <TableHeaderCell>Días libres</TableHeaderCell>
                        <TableHeaderCell>Tarifa/día</TableHeaderCell>
                        <TableHeaderCell>Facturable</TableHeaderCell>
                        <TableHeaderCell>Inicio</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {container.charges.map((ch) => (
                        <TableRow key={ch.id}>
                          <TableCell>{containerChargeLabel[ch.type]}</TableCell>
                          <TableCell numeric>{ch.freeDays}</TableCell>
                          <TableCell numeric>{ch.ratePerDay ? `${ch.currency} ${ch.ratePerDay}` : "—"}</TableCell>
                          <TableCell>{ch.billable ? "Sí" : "No"}</TableCell>
                          <TableCell numeric>{ch.startAt ? formatDateShort(ch.startAt) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                ) : (
                  <EmptyState compact icon={<DollarSign />} title="Sin cargos registrados" />
                )}
              </div>
              {canManage ? (
                <Collapsible className="mt-4" icon={<Plus />} summary="Registrar cargo" tone="default">
                  <form action={addContainerChargeAction.bind(null, tenantSlug)} className="grid gap-3 sm:grid-cols-2">
                    <input name="containerId" type="hidden" value={container.id} />
                    <SelectField label="Tipo de cargo" name="type">
                      <option value="DEMURRAGE">Demurrage</option>
                      <option value="DETENTION">Detention</option>
                      <option value="ALMACENAJE_PORTUARIO">Almacenaje portuario</option>
                      <option value="ESPERA">Espera</option>
                      <option value="STANDBY">Standby</option>
                      <option value="MANIOBRAS">Maniobras</option>
                      <option value="SOBRECOSTO">Sobrecosto</option>
                      <option value="REENTREGA">Reentrega</option>
                      <option value="REPROGRAMACION">Reprogramación</option>
                      <option value="RETENCION">Retención</option>
                      <option value="TERCEROS">Cargos de terceros</option>
                    </SelectField>
                    <Field label="Días libres" name="freeDays" required={false} type="number" />
                    <Field label="Tarifa por día" name="ratePerDay" placeholder="150.00" required={false} type="number" />
                    <Field label="Moneda" name="currency" placeholder="USD" required={false} />
                    <Field label="Inicio del conteo" name="startAt" required={false} type="date" />
                    <label className="flex items-center gap-2 self-end text-sm text-foreground">
                      <input className="size-4 rounded border-border accent-primary" defaultChecked name="billable" type="checkbox" />
                      Facturable al cliente
                    </label>
                    <div className="sm:col-span-2">
                      <TextArea label="Observaciones" name="notes" />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton>Registrar cargo</SubmitButton>
                    </div>
                  </form>
                </Collapsible>
              ) : null}
            </Card>
          </div>

          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <CardHeader description="Avance del ciclo de vida." icon={<ArrowRight />} title="Estado" />
              <div className="mt-4">
                <StatusBadge label={containerStatusLabel[container.status]} tone={containerStatusTone[container.status]} />
              </div>
              {canManage && nextStates.length ? (
                <form action={transitionContainerAction.bind(null, tenantSlug)} className="mt-4 grid gap-2.5">
                  <input name="containerId" type="hidden" value={container.id} />
                  <SelectField label="Siguiente estado" name="nextStatus">
                    {nextStates.map((s) => (
                      <option key={s} value={s}>
                        {containerStatusLabel[s]}
                      </option>
                    ))}
                  </SelectField>
                  <SubmitButton>Avanzar estado</SubmitButton>
                </form>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {nextStates.length ? "Solo lectura para su rol." : "Expediente en estado final."}
                </p>
              )}
            </Card>

            <Card>
              <CardHeader description="Excepción de liberación (aduana/terminal)." icon={<Boxes />} title="Liberación" />
              <div className="mt-3">
                <StatusBadge
                  label={container.releaseStatus === "LIBERADO" ? "Liberado" : container.releaseStatus === "RECHAZADO" ? "Rechazado" : container.releaseStatus === "RETENIDO" ? "Retenido" : "Pendiente"}
                  tone={container.releaseStatus === "LIBERADO" ? "success" : container.releaseStatus === "PENDIENTE" ? "neutral" : "danger"}
                />
              </div>
              {canManage ? (
                <form action={setContainerReleaseAction.bind(null, tenantSlug)} className="mt-4 grid gap-2.5">
                  <input name="containerId" type="hidden" value={container.id} />
                  <SelectField label="Estado de liberación" name="releaseStatus">
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="LIBERADO">Liberado</option>
                    <option value="RECHAZADO">Rechazado</option>
                    <option value="RETENIDO">Retenido</option>
                  </SelectField>
                  <Field label="Motivo / referencia" name="reason" required={false} />
                  <SubmitButton>Actualizar liberación</SubmitButton>
                </form>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
