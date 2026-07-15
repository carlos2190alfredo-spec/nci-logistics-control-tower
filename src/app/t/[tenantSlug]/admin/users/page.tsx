import Link from "next/link";
import { PlusCircle, Users } from "lucide-react";
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
import { tenantRoleLabel } from "@/lib/ui/status";
import { toggleMembershipAction } from "@/lib/server/tenant-user-actions";
import type { Prisma, TenantRole } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const pg = parsePagination(await searchParams, {
    defaultPageSize: 20,
    filterKeys: ["role", "active"],
  });

  const db = getDb();
  const where: Prisma.TenantMembershipWhereInput = { tenantId: tenant.id };

  if (pg.search) {
    where.user = {
      OR: [
        { name: { contains: pg.search, mode: "insensitive" } },
        { email: { contains: pg.search, mode: "insensitive" } },
      ],
    };
  }
  if (pg.filters.role) {
    where.role = pg.filters.role as TenantRole;
  }
  if (pg.filters.active === "true") where.active = true;
  if (pg.filters.active === "false") where.active = false;

  const [memberships, total] = await Promise.all([
    db.tenantMembership.findMany({
      where,
      include: { user: { select: { name: true, email: true, active: true, lastLoginAt: true } } },
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.take,
    }),
    db.tenantMembership.count({ where }),
  ]);

  const result = paginatedResult(memberships, total, pg);
  const basePath = `/t/${tenantSlug}/admin/users`;

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
            { label: "Usuarios" },
          ]}
          description={`${total} miembro(s) del tenant.`}
          title="Usuarios del Tenant"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchToolbar
            filters={[
              {
                key: "role",
                label: "Rol",
                options: [
                  { value: "TENANT_OWNER", label: "Propietario" },
                  { value: "TENANT_ADMIN", label: "Administrador" },
                  { value: "OPERATIONS_MANAGER", label: "Gerente operaciones" },
                  { value: "DISPATCHER", label: "Despachador" },
                  { value: "SAFETY_MANAGER", label: "Gerente seguridad" },
                  { value: "DRIVER", label: "Conductor" },
                ],
              },
              {
                key: "active",
                label: "Estado",
                options: [
                  { value: "true", label: "Activo" },
                  { value: "false", label: "Inactivo" },
                ],
              },
            ]}
            placeholder="Buscar por nombre o correo..."
          />
          <Link className={buttonStyles({ variant: "primary" })} href={`${basePath}/new`}>
            <PlusCircle aria-hidden className="size-4" />
            Crear usuario
          </Link>
        </div>

        <Card>
          <CardHeader description="Miembros con acceso al tenant y sus roles." icon={<Users />} title="Miembros" />
          <div className="mt-4">
            <DataTable caption="Miembros del tenant">
              <TableHead>
                <tr>
                  <TableHeaderCell>Nombre</TableHeaderCell>
                  <TableHeaderCell>Correo</TableHeaderCell>
                  <TableHeaderCell>Rol</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Ultimo acceso</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.user.name}</TableCell>
                    <TableCell><span className="text-xs">{m.user.email}</span></TableCell>
                    <TableCell><StatusBadge label={tenantRoleLabel[m.role]} tone="info" /></TableCell>
                    <TableCell>
                      <StatusBadge
                        label={m.active && m.user.active ? "Activo" : "Inactivo"}
                        tone={m.active && m.user.active ? "success" : "neutral"}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-faint-foreground">
                      {m.user.lastLoginAt ? new Date(m.user.lastLoginAt).toLocaleDateString("es-PA") : "Nunca"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${basePath}/${m.id}/edit`}>
                          Editar
                        </Link>
                        <form action={toggleMembershipAction}>
                          <input name="tenantSlug" type="hidden" value={tenantSlug} />
                          <input name="membershipId" type="hidden" value={m.id} />
                          <button className="text-sm font-semibold text-warning-strong hover:underline" type="submit">
                            {m.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
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
