import Link from "next/link";
import { PlusCircle, Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  PageHeader,
  Pagination,
  SearchToolbar,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { buttonStyles } from "@/components/ui/button-styles";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { parsePagination, paginatedResult, buildPageUrl } from "@/lib/pagination/parse";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import type { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantDriversPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const pg = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["status"],
  });

  const db = getDb();
  const where: Prisma.DriverWhereInput = { tenantId: tenant.id };

  if (pg.search) {
    where.OR = [
      { name: { contains: pg.search, mode: "insensitive" } },
      { code: { contains: pg.search, mode: "insensitive" } },
      { license: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  if (pg.filters.status) {
    where.status = pg.filters.status;
  }

  const [drivers, total] = await Promise.all([
    db.driver.findMany({
      where,
      include: { user: { select: { name: true, email: true } }, _count: { select: { trips: true } } },
      orderBy: { name: "asc" },
      skip: pg.skip,
      take: pg.take,
    }),
    db.driver.count({ where }),
  ]);

  const result = paginatedResult(drivers, total, pg);
  const basePath = `/t/${tenantSlug}/admin/drivers`;

  return (
    <AppShell
      brandContext={tenant.name}
      brandName="Administracion"
      navGroups={getTenantAdminNavGroups(tenantSlug)}
      user={{ name: user.name, role: "Administrador" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Admin", href: `/t/${tenantSlug}/admin` },
            { label: "Conductores" },
          ]}
          description={`${total} conductor(es) registrados.`}
          title="Conductores"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchToolbar
            filters={[
              {
                key: "status",
                label: "Estado",
                options: [
                  { value: "AVAILABLE", label: "Disponible" },
                  { value: "ON_TRIP", label: "En viaje" },
                  { value: "OFF_DUTY", label: "Fuera de servicio" },
                  { value: "INACTIVE", label: "Inactivo" },
                ],
              },
            ]}
            placeholder="Buscar por nombre, codigo o licencia..."
          />
          <Link className={buttonStyles({ variant: "primary" })} href={`${basePath}/new`}>
            <PlusCircle aria-hidden className="size-4" />
            Crear conductor
          </Link>
        </div>

        <Card>
          <CardHeader description="Conductores del tenant con su estado y viajes." icon={<Truck />} title="Conductores" />
          <div className="mt-4">
            <DataTable caption="Conductores del tenant">
              <TableHead>
                <tr>
                  <TableHeaderCell>Nombre</TableHeaderCell>
                  <TableHeaderCell>Codigo</TableHeaderCell>
                  <TableHeaderCell>Licencia</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Usuario vinculado</TableHeaderCell>
                  <TableHeaderCell className="text-right">Viajes</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold">{d.name}</TableCell>
                    <TableCell><code className="text-xs">{d.code}</code></TableCell>
                    <TableCell>{d.license}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={d.status === "AVAILABLE" ? "Disponible" : d.status === "ON_TRIP" ? "En viaje" : d.status === "OFF_DUTY" ? "Fuera de servicio" : "Inactivo"}
                        tone={d.status === "AVAILABLE" ? "success" : d.status === "ON_TRIP" ? "progress" : "neutral"}
                      />
                    </TableCell>
                    <TableCell>{d.user ? d.user.email : "—"}</TableCell>
                    <TableCell className="text-right" numeric>{d._count.trips}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/${d.id}/edit`}>
                          Editar
                        </Link>
                        <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/${d.id}/schedule`}>
                          Horario
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
          <div className="mt-4">
            <Pagination
              buildUrl={(p) => buildPageUrl(basePath, pg, p)}
              hasNext={result.hasNext}
              hasPrev={result.hasPrev}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
