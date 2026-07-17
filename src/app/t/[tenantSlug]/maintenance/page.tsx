import { Wrench, Ban, ClipboardList, Plus } from "lucide-react";
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
import { getMaintenanceOrders, summarizeMaintenance } from "@/lib/server/maintenance-data";
import {
  createMaintenanceOrderAction,
  transitionMaintenanceOrderAction,
} from "@/lib/server/maintenance-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  maintenanceAssetLabel,
  maintenanceStatusLabel,
  maintenanceStatusTone,
  maintenanceTypeLabel,
} from "@/lib/ui/maintenance";
import { formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "SAFETY_MANAGER",
  ]);

  const orders = await getMaintenanceOrders(tenant.id);
  const counts = summarizeMaintenance(orders);
  const canManage = hasPermission(membership.role, "tenant.maintenance.manage");

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
            { label: "Mantenimiento" },
          ]}
          description="Órdenes de mantenimiento preventivo y correctivo. Un equipo con orden abierta que bloquea no puede asignarse."
          title="Mantenimiento de flota"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader icon={<ClipboardList />} title="Órdenes" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.total}</p>
          </Card>
          <Card>
            <CardHeader icon={<Wrench />} title="Abiertas" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.open}</p>
          </Card>
          <Card>
            <CardHeader icon={<Ban />} title="Equipos bloqueados" />
            <p className="mt-2 text-3xl font-bold text-foreground">{counts.blockedAssets}</p>
          </Card>
        </div>

        {canManage ? (
          <Collapsible icon={<Plus />} summary="Registrar orden de mantenimiento" tone="default">
            <form action={createMaintenanceOrderAction.bind(null, tenantSlug)} className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Tipo de activo" name="assetType">
                <option value="VEHICULO">Vehículo</option>
                <option value="EQUIPO">Equipo</option>
              </SelectField>
              <Field help="Código del activo (VH-1, EQ-1…)." label="Activo" name="assetCode" placeholder="VH-1" required />
              <SelectField label="Tipo" name="type">
                <option value="PREVENTIVO">Preventivo</option>
                <option value="CORRECTIVO">Correctivo</option>
                <option value="INSPECCION">Inspección</option>
              </SelectField>
              <Field label="Proveedor" name="provider" required={false} />
              <Field label="Fecha programada" name="scheduledAt" required={false} type="date" />
              <Field label="Costo" name="cost" required={false} type="number" />
              <Field label="Odómetro (km)" name="odometerKm" required={false} type="number" />
              <Field label="Próximo servicio (km)" name="nextServiceKm" required={false} type="number" />
              <Field label="Próximo servicio (fecha)" name="nextServiceAt" required={false} type="date" />
              <label className="flex items-center gap-2 self-end text-sm text-foreground">
                <input className="size-4 rounded border-border accent-primary" defaultChecked name="blocksAsset" type="checkbox" />
                Bloquea el equipo para asignación
              </label>
              <div className="sm:col-span-2">
                <TextArea label="Descripción" name="description" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Registrar orden</SubmitButton>
              </div>
            </form>
          </Collapsible>
        ) : null}

        <Card>
          <CardHeader description="Órdenes registradas." icon={<Wrench />} title="Órdenes" />
          <div className="mt-4 overflow-x-auto">
            {orders.length ? (
              <DataTable caption="Órdenes de mantenimiento">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Activo</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Descripción</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Bloquea</TableHeaderCell>
                    <TableHeaderCell>Programada</TableHeaderCell>
                    {canManage ? <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell> : null}
                  </tr>
                </TableHead>
                <TableBody>
                  {orders.map((o) => {
                    const isOpen = o.status === "PROGRAMADO" || o.status === "EN_PROGRESO";
                    return (
                      <TableRow key={o.id}>
                        <TableCell>
                          <span className="font-medium text-foreground">{maintenanceAssetLabel[o.assetType]} {o.assetCode}</span>
                        </TableCell>
                        <TableCell>{maintenanceTypeLabel[o.type]}</TableCell>
                        <TableCell><span className="line-clamp-2">{o.description}</span></TableCell>
                        <TableCell>
                          <StatusBadge label={maintenanceStatusLabel[o.status]} tone={maintenanceStatusTone[o.status]} />
                        </TableCell>
                        <TableCell>{o.blocksAsset ? "Sí" : "No"}</TableCell>
                        <TableCell numeric>{o.scheduledAt ? formatDateShort(o.scheduledAt) : "—"}</TableCell>
                        {canManage ? (
                          <TableCell>
                            {isOpen ? (
                              <div className="flex flex-wrap gap-1.5">
                                {o.status === "PROGRAMADO" ? (
                                  <form action={transitionMaintenanceOrderAction.bind(null, tenantSlug)}>
                                    <input name="orderId" type="hidden" value={o.id} />
                                    <input name="action" type="hidden" value="start" />
                                    <button className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted" type="submit">Iniciar</button>
                                  </form>
                                ) : null}
                                <form action={transitionMaintenanceOrderAction.bind(null, tenantSlug)}>
                                  <input name="orderId" type="hidden" value={o.id} />
                                  <input name="action" type="hidden" value="complete" />
                                  <button className="rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs font-medium text-success hover:bg-success/20" type="submit">Completar</button>
                                </form>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DataTable>
            ) : (
              <EmptyState
                description="Registre órdenes de mantenimiento para controlar la disponibilidad de la flota."
                icon={<Wrench />}
                title="Sin órdenes de mantenimiento"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
