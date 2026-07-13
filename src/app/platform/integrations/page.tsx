import Link from "next/link";
import { Link2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  DataTable,
  MetricCard,
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
import { CONNECTOR_CATALOG } from "@/lib/integrations";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function PlatformIntegrationsPage() {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();

  const tenantIntegrations = await db.tenantIntegration.findMany({
    include: {
      tenant: { select: { name: true, slug: true } },
      connector: { select: { type: true, name: true } },
      _count: { select: { events: true, credentials: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const enabledCount = tenantIntegrations.filter((ti) => ti.enabled).length;

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Plataforma", href: "/platform" }, { label: "Integraciones" }]}
          description="Estado global de conectores e integraciones de tenants."
          title="Conectores de Integracion"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<Link2 />} label="Conectores disponibles" value={CONNECTOR_CATALOG.length} />
          <MetricCard icon={<Link2 />} label="Integraciones activas" tone="success" value={enabledCount} />
          <MetricCard icon={<Link2 />} label="Total configuradas" value={tenantIntegrations.length} />
        </div>

        <Card>
          <CardHeader
            description="Catalogo de conectores disponibles en la plataforma. Todos desactivados por defecto."
            icon={<Link2 />}
            title="Catalogo de conectores"
          />
          <div className="mt-4">
            <DataTable caption="Conectores disponibles">
              <TableHead>
                <tr>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Nombre</TableHeaderCell>
                  <TableHeaderCell>Descripcion</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {CONNECTOR_CATALOG.map((c) => (
                  <TableRow key={c.type}>
                    <TableCell><code className="text-xs">{c.type}</code></TableCell>
                    <TableCell className="font-semibold">{c.name}</TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell>{c.version}</TableCell>
                    <TableCell>
                      <StatusBadge label="Desactivado" tone="neutral" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        {tenantIntegrations.length > 0 && (
          <Card>
            <CardHeader
              description="Integraciones configuradas por tenants."
              icon={<Link2 />}
              title="Integraciones por tenant"
            />
            <div className="mt-4">
              <DataTable caption="Integraciones de tenants">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Tenant</TableHeaderCell>
                    <TableHeaderCell>Conector</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Habilitado</TableHeaderCell>
                    <TableHeaderCell>Credenciales</TableHeaderCell>
                    <TableHeaderCell>Eventos</TableHeaderCell>
                    <TableHeaderCell>Ultima sincronizacion</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {tenantIntegrations.map((ti) => (
                    <TableRow key={ti.id}>
                      <TableCell>
                        <Link className="font-semibold text-primary hover:text-primary-hover" href={`/platform/tenants/${ti.tenantId}`}>
                          {ti.tenant.name}
                        </Link>
                      </TableCell>
                      <TableCell>{ti.connector.name}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={ti.status}
                          tone={ti.status === "ENABLED" ? "success" : ti.status === "ERROR" ? "danger" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={ti.enabled ? "Si" : "No"} tone={ti.enabled ? "success" : "neutral"} />
                      </TableCell>
                      <TableCell className="text-sm" numeric>{ti._count.credentials}</TableCell>
                      <TableCell className="text-sm" numeric>{ti._count.events}</TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {ti.lastSyncAt ? ti.lastSyncAt.toLocaleString("es") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
