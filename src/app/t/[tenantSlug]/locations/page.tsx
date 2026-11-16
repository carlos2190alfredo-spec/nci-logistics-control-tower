import Link from "next/link";
import { MapPin } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { LocationForm } from "@/components/catalog/catalog-forms";
import { CsvImportPanel } from "@/components/import/csv-import-panel";
import {
  Card, CardHeader, DataTable, EmptyState, PageHeader, PageNotice, Pagination, SearchToolbar, StatusBadge,
  TableBody, TableCell, TableHead, TableHeaderCell, TableRow,
} from "@/components/ui";
import { buildPageUrl, paginatedResult, parsePagination } from "@/lib/pagination";
import { requireTenantPermission } from "@/lib/server/auth";
import { createLocationAction } from "@/lib/server/catalog-actions";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { catalogNotices } from "@/lib/ui/catalog-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import type { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lugares frecuentes" };

export default async function LocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.view");
  const sp = await searchParams;
  const pg = parsePagination(sp, { filterKeys: ["estado"] });
  const estado = pg.filters.estado === "inactivos" || pg.filters.estado === "todos" ? pg.filters.estado : "activos";
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");

  const where: Prisma.LocationWhereInput = { tenantId: tenant.id };
  if (estado === "activos") where.active = true;
  if (estado === "inactivos") where.active = false;
  if (pg.search) {
    where.OR = [
      { name: { contains: pg.search, mode: "insensitive" } },
      { address: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  const db = getDb();
  const [items, total] = await Promise.all([
    db.location.findMany({ where, orderBy: { name: "asc" }, skip: pg.skip, take: pg.take }),
    db.location.count({ where }),
  ]);
  const result = paginatedResult(items, total, pg);
  const basePath = `/t/${tenantSlug}/locations`;
  const filtered = Boolean(pg.search) || estado !== "activos";

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Lugares" }]}
          description="Puertos, patios, bodegas y direcciones que usa a menudo. Aparecen como sugerencias al crear un viaje."
          title="Lugares frecuentes"
        />
        <PageNotice code={sp.aviso} messages={catalogNotices} />

        {canManage ? (
          <Card>
            <CardHeader icon={<MapPin />} title="Agregar lugar" />
            <div className="mt-4">
              <LocationForm action={createLocationAction.bind(null, tenantSlug)} mode="create" />
            </div>
            <div className="mt-4">
              <CsvImportPanel canImport kind="locations" tenantSlug={tenantSlug} />
            </div>
          </Card>
        ) : null}

        <SearchToolbar
          filters={[{ key: "estado", label: "Mostrar", allLabel: "Activos", options: [{ value: "inactivos", label: "Inactivos" }, { value: "todos", label: "Todos" }] }]}
          placeholder="Buscar por nombre o dirección…"
        />

        {result.total === 0 ? (
          <EmptyState
            description={filtered ? "Pruebe con otra búsqueda o cambie el filtro." : canManage ? "Agregue sus lugares frecuentes para elegirlos rápido al crear un viaje." : "Todavía no hay lugares registrados."}
            icon={<MapPin />}
            title={filtered ? "Sin resultados" : "Todavía no tiene lugares"}
          />
        ) : (
          <Card>
            <DataTable caption="Lugares frecuentes">
              <TableHead>
                <tr>
                  <TableHeaderCell>Lugar</TableHeaderCell>
                  <TableHeaderCell>Dirección</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {result.items.map((place) => (
                  <TableRow data-testid={`location-row-${place.id}`} key={place.id}>
                    <TableCell><span className="font-semibold text-foreground">{place.name}</span></TableCell>
                    <TableCell>{place.address || "Sin dirección"}</TableCell>
                    <TableCell><StatusBadge label={place.active ? "Activo" : "Inactivo"} tone={place.active ? "success" : "neutral"} /></TableCell>
                    <TableCell>
                      <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/${place.id}`}>
                        Editar<span className="sr-only"> {place.name}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
            <div className="mt-4">
              <Pagination buildUrl={(page) => buildPageUrl(basePath, pg, page)} hasNext={result.hasNext} hasPrev={result.hasPrev} page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} />
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
