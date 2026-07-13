import { Truck } from "lucide-react";
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

export default async function TenantDriversPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const db = getDb();

  const drivers = await db.driver.findMany({
    where: { tenantId: tenant.id },
    include: { user: { select: { name: true, email: true } }, _count: { select: { trips: true } } },
    orderBy: { name: "asc" },
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
            { label: "Conductores" },
          ]}
          description={`${drivers.length} conductor(es) registrados.`}
          title="Conductores"
        />

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
                        label={d.status}
                        tone={d.status === "AVAILABLE" ? "success" : d.status === "ON_TRIP" ? "progress" : "neutral"}
                      />
                    </TableCell>
                    <TableCell>{d.user ? d.user.email : "—"}</TableCell>
                    <TableCell className="text-right" numeric>{d._count.trips}</TableCell>
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
