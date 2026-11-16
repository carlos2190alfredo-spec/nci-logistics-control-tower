import Link from "next/link";
import { Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { EquipmentForm, VehicleForm } from "@/components/fleet/fleet-forms";
import { CsvImportPanel } from "@/components/import/csv-import-panel";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  PageNotice,
  Pagination,
  SearchToolbar,
  SegmentedLinks,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  UsageBar,
} from "@/components/ui";
import { MAX_EQUIPMENT_PER_TENANT } from "@/lib/catalog/limits";
import { assetStatusText, assetStatusToneFor } from "@/lib/catalog/labels";
import { buildPageUrl, parsePagination } from "@/lib/pagination";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { createEquipmentAction, createVehicleAction } from "@/lib/server/fleet-actions";
import { countFleet, listEquipment, listVehicles, parseFleetStatus } from "@/lib/server/fleet-data";
import { getPlanUsage } from "@/lib/server/plan-limits";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { fleetNotices } from "@/lib/ui/fleet-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

export const metadata = { title: "Flota" };

export default async function FleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  const view = sp.vista === "equipos" ? "equipos" : "vehiculos";
  const pg = parsePagination(sp, { filterKeys: ["estado"] });
  const status = parseFleetStatus(pg.filters.estado);
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");
  const basePath = `/t/${tenantSlug}/fleet`;
  const filtered = Boolean(pg.search) || status !== "activos";

  const [counts, planUsage] = await Promise.all([countFleet(tenant.id), getPlanUsage(getDb(), tenant.id)]);
  const vehicles = view === "vehiculos" ? await listVehicles(tenant.id, pg, status) : null;
  const equipment = view === "equipos" ? await listEquipment(tenant.id, pg, status) : null;
  const result = vehicles ?? equipment!;

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Flota" }]}
          description="Sus vehículos y los equipos (chasis y remolques) que usa en los viajes."
          title="Flota"
        />

        <PageNotice code={sp.aviso} messages={fleetNotices} />

        <SegmentedLinks
          items={[
            { label: "Vehículos", href: `${basePath}?vista=vehiculos`, active: view === "vehiculos", count: counts.vehicles },
            { label: "Equipos", href: `${basePath}?vista=equipos`, active: view === "equipos", count: counts.equipment },
          ]}
        />

        {view === "vehiculos" ? (
          <UsageBar label="Vehículos activos" max={planUsage.plan.maxVehicles} used={planUsage.usage.vehicles} />
        ) : (
          <UsageBar label="Equipos activos" max={MAX_EQUIPMENT_PER_TENANT} used={counts.equipment} />
        )}

        {canManage ? (
          <Card>
            <CardHeader
              description={
                view === "vehiculos"
                  ? "Tractos, camiones y otros vehículos con los que presta el servicio."
                  : "Chasis, remolques, plataformas y tanques que se enganchan a un vehículo. No todos los servicios los usan."
              }
              icon={<Truck />}
              title={view === "vehiculos" ? "Agregar vehículo" : "Agregar equipo"}
            />
            <div className="mt-4">
              {view === "vehiculos" ? (
                <VehicleForm action={createVehicleAction.bind(null, tenantSlug)} mode="create" />
              ) : (
                <EquipmentForm action={createEquipmentAction.bind(null, tenantSlug)} mode="create" />
              )}
            </div>
            <div className="mt-4">
              <CsvImportPanel canImport kind={view === "vehiculos" ? "vehicles" : "equipment"} tenantSlug={tenantSlug} />
            </div>
          </Card>
        ) : null}

        <SearchToolbar
          filters={[
            {
              key: "estado",
              label: "Mostrar",
              allLabel: "Activos",
              options: [
                { value: "inactivos", label: "Inactivos" },
                { value: "todos", label: "Todos" },
              ],
            },
          ]}
          placeholder={view === "vehiculos" ? "Buscar por placa, unidad o tipo…" : "Buscar por código o tipo…"}
        />

        {result.total === 0 ? (
          <EmptyState
            description={
              filtered
                ? "Pruebe con otra búsqueda o cambie el filtro."
                : canManage
                  ? view === "vehiculos"
                    ? "Agregue su primer vehículo con el formulario de arriba para poder asignarle viajes."
                    : "Si sus servicios usan chasis o remolque, agréguelos aquí para poder asignarlos."
                  : "Todavía no hay registros. Pídale al propietario o a operaciones que los agregue."
            }
            icon={<Truck />}
            title={filtered ? "Sin resultados" : view === "vehiculos" ? "Todavía no tiene vehículos" : "Todavía no tiene equipos"}
          />
        ) : (
          <Card>
            <DataTable caption={view === "vehiculos" ? "Vehículos de la empresa" : "Equipos de la empresa"}>
              <TableHead>
                <tr>
                  <TableHeaderCell>{view === "vehiculos" ? "Vehículo" : "Equipo"}</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">Acciones</span>
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {vehicles?.items.map((vehicle) => (
                  <TableRow data-testid={`vehicle-row-${vehicle.id}`} key={vehicle.id}>
                    <TableCell>
                      <span className="block font-semibold text-foreground">{vehicle.plate}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{vehicle.code}</span>
                    </TableCell>
                    <TableCell>{vehicle.type}</TableCell>
                    <TableCell>
                      <StatusBadge label={assetStatusText(vehicle.status)} tone={assetStatusToneFor(vehicle.status)} />
                    </TableCell>
                    <TableCell>
                      <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/vehicles/${vehicle.id}`}>
                        Editar<span className="sr-only"> {vehicle.plate}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {equipment?.items.map((item) => (
                  <TableRow data-testid={`equipment-row-${item.id}`} key={item.id}>
                    <TableCell>
                      <span className="block font-mono font-semibold text-foreground">{item.code}</span>
                    </TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>
                      <StatusBadge label={assetStatusText(item.status)} tone={assetStatusToneFor(item.status)} />
                    </TableCell>
                    <TableCell>
                      <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/equipment/${item.id}`}>
                        Editar<span className="sr-only"> {item.code}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
            <div className="mt-4">
              <Pagination
                buildUrl={(page) => `${buildPageUrl(basePath, pg, page)}${buildPageUrl(basePath, pg, page).includes("?") ? "&" : "?"}vista=${view}`}
                hasNext={result.hasNext}
                hasPrev={result.hasPrev}
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                totalPages={result.totalPages}
              />
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
