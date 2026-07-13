import { Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  PageHeader,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const roleLabel: Record<string, string> = {
  TENANT_OWNER: "Propietario",
  TENANT_ADMIN: "Administrador",
  OPERATIONS_MANAGER: "Gerente operaciones",
  DISPATCHER: "Despachador",
  SAFETY_MANAGER: "Gerente seguridad",
  DRIVER: "Conductor",
};

export default async function TenantUsersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const db = getDb();

  const memberships = await db.tenantMembership.findMany({
    where: { tenantId: tenant.id },
    include: { user: { select: { name: true, email: true, active: true, lastLoginAt: true } } },
    orderBy: { createdAt: "asc" },
  });

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
          description={`${memberships.length} miembro(s) del tenant.`}
          title="Usuarios del Tenant"
        />

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
                </tr>
              </TableHead>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.user.name}</TableCell>
                    <TableCell>{m.user.email}</TableCell>
                    <TableCell><StatusBadge label={roleLabel[m.role] ?? m.role} tone="info" /></TableCell>
                    <TableCell>
                      <StatusBadge
                        label={m.active && m.user.active ? "Activo" : "Inactivo"}
                        tone={m.active && m.user.active ? "success" : "neutral"}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-faint-foreground">
                      {m.user.lastLoginAt ? m.user.lastLoginAt.toLocaleDateString("es") : "Nunca"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
