import Link from "next/link";
import { Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { CustomerForm } from "@/components/customers/customer-form";
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
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  UsageBar,
} from "@/components/ui";
import { buildPageUrl, parsePagination } from "@/lib/pagination";
import { requireTenantPermission } from "@/lib/server/auth";
import { createCustomerAction } from "@/lib/server/customer-actions";
import { listCustomers, parseCustomerStatus } from "@/lib/server/customer-data";
import { getDb } from "@/lib/server/db";
import { getPlanUsage } from "@/lib/server/plan-limits";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { customerNotices } from "@/lib/ui/customer-notices";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({
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
  const status = parseCustomerStatus(pg.filters.estado);
  const canManage = hasPermission(membership.role, "tenant.catalogs.manage");

  const [result, planUsage] = await Promise.all([
    listCustomers(tenant.id, pg, status),
    getPlanUsage(getDb(), tenant.id),
  ]);
  const basePath = `/t/${tenantSlug}/customers`;
  const filtered = Boolean(pg.search) || status !== "activos";

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6 [&>*]:min-w-0">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Clientes" }]}
          description="Las empresas a las que presta servicio. Cada una puede tener usuarios con acceso al portal."
          title="Clientes"
        />

        <PageNotice code={sp.aviso} messages={customerNotices} />

        <UsageBar label="Clientes activos" max={planUsage.plan.maxCustomers} used={planUsage.usage.customers} />

        {canManage ? (
          <Card>
            <CardHeader description="Se les asigna un código automáticamente." icon={<Users />} title="Nuevo cliente" />
            <div className="mt-4">
              <CustomerForm action={createCustomerAction.bind(null, tenantSlug)} resetOnSuccess submitLabel="Agregar cliente" />
            </div>
            <div className="mt-4">
              <CsvImportPanel canImport kind="customers" tenantSlug={tenantSlug} />
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
          placeholder="Buscar por nombre, código, RUC o contacto…"
        />

        {result.total === 0 ? (
          <EmptyState
            description={
              filtered
                ? "Pruebe con otra búsqueda o cambie el filtro."
                : canManage
                  ? "Agregue su primer cliente con el formulario de arriba para poder crearle viajes."
                  : "Todavía no hay clientes registrados. Pídale al propietario o a operaciones que los agregue."
            }
            icon={<Users />}
            title={filtered ? "Sin resultados" : "Todavía no tiene clientes"}
          />
        ) : (
          <Card>
            <DataTable caption="Clientes de la empresa">
              <TableHead>
                <tr>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Contacto</TableHeaderCell>
                  <TableHeaderCell className="text-right">Usuarios del portal</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">Acciones</span>
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {result.items.map((customer) => (
                  <TableRow data-testid={`customer-row-${customer.id}`} key={customer.id}>
                    <TableCell>
                      <span className="block font-semibold text-foreground">{customer.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{customer.code}</span>
                      {customer.taxId ? <span className="block text-xs text-muted-foreground">RUC {customer.taxId}</span> : null}
                    </TableCell>
                    <TableCell>
                      {customer.contactName || customer.contactEmail || customer.contactPhone ? (
                        <>
                          {customer.contactName ? <span className="block">{customer.contactName}</span> : null}
                          {customer.contactEmail ? <span className="block text-xs text-muted-foreground">{customer.contactEmail}</span> : null}
                          {customer.contactPhone ? <span className="block text-xs text-muted-foreground">{customer.contactPhone}</span> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{customer.portalUsers}</TableCell>
                    <TableCell>
                      <StatusBadge label={customer.active ? "Activo" : "Inactivo"} tone={customer.active ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <Link
                        className="text-sm font-semibold text-primary hover:text-primary-hover"
                        href={`${basePath}/${customer.id}`}
                      >
                        Ver ficha<span className="sr-only"> de {customer.name}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
            <div className="mt-4">
              <Pagination
                buildUrl={(page) => buildPageUrl(basePath, pg, page)}
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
