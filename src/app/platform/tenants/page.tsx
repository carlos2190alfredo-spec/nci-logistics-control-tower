import Link from "next/link";
import { ArrowRight, Building2, PlusCircle } from "lucide-react";
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
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { parsePagination, paginatedResult, buildPageUrl } from "@/lib/pagination/parse";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import { tenantStatusLabel, tenantStatusTone } from "@/lib/ui/status";
import type { Prisma, SubscriptionStatus, TenantPlanCode, TenantStatus } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const params = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["status", "plan", "subscription"],
  });

  const db = getDb();

  const where: Prisma.TenantWhereInput = {};
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { legalName: { contains: params.search, mode: "insensitive" } },
      { slug: { contains: params.search, mode: "insensitive" } },
      { contactEmail: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (params.filters.status) {
    where.status = params.filters.status as TenantStatus;
  }
  if (params.filters.plan) {
    where.plan = { code: params.filters.plan as TenantPlanCode };
  }
  if (params.filters.subscription) {
    where.subscriptionStatus = params.filters.subscription as SubscriptionStatus;
  }

  const [tenants, total] = await Promise.all([
    db.tenant.findMany({
      where,
      include: {
        plan: true,
        _count: { select: { trips: true, customers: true, memberships: true, feedback: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    db.tenant.count({ where }),
  ]);

  const result = paginatedResult(tenants, total, params);

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Tenants" }]}
          description={`${total} tenant(s) registrados en la plataforma.`}
          title="Gestion de Tenants"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchToolbar
            filters={[
              {
                key: "status",
                label: "Estado",
                options: [
                  { value: "ACTIVE", label: "Activo" },
                  { value: "SUSPENDED", label: "Suspendido" },
                  { value: "ARCHIVED", label: "Archivado" },
                  { value: "CANCELLED", label: "Cancelado" },
                ],
              },
              {
                key: "plan",
                label: "Plan",
                options: [
                  { value: "DEMO", label: "Demo" },
                  { value: "STARTER", label: "Starter" },
                  { value: "PROFESSIONAL", label: "Professional" },
                  { value: "ENTERPRISE", label: "Enterprise" },
                ],
              },
              {
                key: "subscription",
                label: "Suscripcion",
                options: [
                  { value: "TRIAL", label: "Prueba" },
                  { value: "ACTIVE", label: "Activa" },
                  { value: "SUSPENDED", label: "Suspendida" },
                  { value: "CANCELLED", label: "Cancelada" },
                ],
              },
            ]}
            placeholder="Buscar por nombre, slug o correo..."
          />
          <Link className={buttonStyles({ variant: "primary" })} href="/platform/tenants/new">
            <PlusCircle aria-hidden className="size-4" />
            Crear tenant
          </Link>
        </div>

        <Card>
          <CardHeader
            description="Todos los tenants con su estado, plan y metricas."
            icon={<Building2 />}
            title="Tenants registrados"
          />
          <div className="mt-4">
            <DataTable caption="Lista de tenants con paginacion">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tenant</TableHeaderCell>
                  <TableHeaderCell>Slug</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Plan</TableHeaderCell>
                  <TableHeaderCell>Suscripcion</TableHeaderCell>
                  <TableHeaderCell className="text-right">Usuarios</TableHeaderCell>
                  <TableHeaderCell className="text-right">Clientes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Viajes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Feedback</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <Link className="font-semibold text-foreground hover:text-primary transition-colors" href={`/platform/tenants/${tenant.id}`}>
                        {tenant.name}
                      </Link>
                      <p className="text-xs text-faint-foreground">{tenant.legalName}</p>
                    </TableCell>
                    <TableCell><code className="text-xs">/{tenant.slug}</code></TableCell>
                    <TableCell>
                      <StatusBadge label={tenantStatusLabel[tenant.status]} tone={tenantStatusTone[tenant.status]} />
                    </TableCell>
                    <TableCell>{tenant.plan.name}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={tenant.subscriptionStatus}
                        tone={tenant.subscriptionStatus === "ACTIVE" ? "success" : tenant.subscriptionStatus === "TRIAL" ? "info" : "warning"}
                      />
                    </TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.memberships}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.customers}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.trips}</TableCell>
                    <TableCell className="text-right" numeric>{tenant._count.feedback}</TableCell>
                    <TableCell>
                      <Link
                        className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary-hover"
                        href={`/platform/tenants/${tenant.id}`}
                      >
                        Ver <ArrowRight aria-hidden className="size-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
          <div className="mt-4">
            <Pagination
              buildUrl={(p) => buildPageUrl("/platform/tenants", params, p)}
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
