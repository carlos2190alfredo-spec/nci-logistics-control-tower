import { Settings } from "lucide-react";
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
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function PlatformPlansPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const db = getDb();
  const plans = await db.tenantPlan.findMany({
    include: { _count: { select: { tenants: true } } },
    orderBy: { code: "asc" },
  });

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Planes" }]}
          description="Configuracion de planes y limites por nivel."
          title="Gestion de Planes"
        />

        <Card>
          <CardHeader description="Planes disponibles y sus limites." icon={<Settings />} title="Planes" />
          <div className="mt-4">
            <DataTable caption="Planes de la plataforma">
              <TableHead>
                <tr>
                  <TableHeaderCell>Plan</TableHeaderCell>
                  <TableHeaderCell>Codigo</TableHeaderCell>
                  <TableHeaderCell className="text-right">Max usuarios</TableHeaderCell>
                  <TableHeaderCell className="text-right">Max conductores</TableHeaderCell>
                  <TableHeaderCell className="text-right">Max vehiculos</TableHeaderCell>
                  <TableHeaderCell className="text-right">Max clientes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Max documentos</TableHeaderCell>
                  <TableHeaderCell>Portal</TableHeaderCell>
                  <TableHeaderCell>Driver app</TableHeaderCell>
                  <TableHeaderCell>Integraciones</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tenants</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.name}</TableCell>
                    <TableCell><code className="text-xs">{p.code}</code></TableCell>
                    <TableCell className="text-right" numeric>{p.maxUsers}</TableCell>
                    <TableCell className="text-right" numeric>{p.maxDrivers}</TableCell>
                    <TableCell className="text-right" numeric>{p.maxVehicles}</TableCell>
                    <TableCell className="text-right" numeric>{p.maxCustomers}</TableCell>
                    <TableCell className="text-right" numeric>{p.maxDocuments}</TableCell>
                    <TableCell>
                      <StatusBadge label={p.portalEnabled ? "Si" : "No"} tone={p.portalEnabled ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={p.driverAppEnabled ? "Si" : "No"} tone={p.driverAppEnabled ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={p.integrationsEnabled ? "Si" : "No"} tone={p.integrationsEnabled ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell className="text-right" numeric>{p._count.tenants}</TableCell>
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
