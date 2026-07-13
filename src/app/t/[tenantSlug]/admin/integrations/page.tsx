import { Link2 } from "lucide-react";
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
import { CONNECTOR_CATALOG } from "@/lib/integrations/registry";
import type { StatusTone } from "@/lib/ui/status";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const statusLabel: Record<string, string> = {
  DISABLED: "Desactivado",
  ENABLED: "Activo",
  ERROR: "Error",
  CONFIGURING: "Configurando",
};

const statusTone: Record<string, StatusTone> = {
  DISABLED: "neutral",
  ENABLED: "success",
  ERROR: "danger",
  CONFIGURING: "warning",
};

export default async function TenantIntegrationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);
  const db = getDb();

  const tenantIntegrations = await db.tenantIntegration.findMany({
    where: { tenantId: tenant.id },
    include: { connector: true },
    orderBy: { createdAt: "desc" },
  });

  const connectorMap = new Map(
    tenantIntegrations.map((ti) => [ti.connector.type, ti]),
  );

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
            { label: "Integraciones" },
          ]}
          description="Estado de los conectores disponibles para este tenant."
          title="Integraciones"
        />

        <Card>
          <CardHeader
            description="Conectores del catalogo y su estado de activacion en este tenant."
            icon={<Link2 />}
            title="Conectores"
          />
          <div className="mt-4">
            <DataTable caption="Conectores de integracion">
              <TableHead>
                <tr>
                  <TableHeaderCell>Conector</TableHeaderCell>
                  <TableHeaderCell>Descripcion</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {CONNECTOR_CATALOG.map((c) => {
                  const ti = connectorMap.get(c.type);
                  const status = ti?.status ?? "DISABLED";
                  return (
                    <TableRow key={c.type}>
                      <TableCell className="font-semibold">{c.name}</TableCell>
                      <TableCell className="text-sm text-faint-foreground">{c.description}</TableCell>
                      <TableCell><code className="text-xs">{c.version}</code></TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel[status] ?? status}
                          tone={statusTone[status] ?? "neutral"}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        {tenantIntegrations.length > 0 && (
          <Card>
            <CardHeader
              description="Integraciones activadas con detalles de configuracion."
              icon={<Link2 />}
              title="Integraciones activas"
            />
            <div className="mt-4">
              <DataTable caption="Integraciones activas del tenant">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Conector</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Habilitado</TableHeaderCell>
                    <TableHeaderCell>Ultima actualizacion</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {tenantIntegrations.map((ti) => (
                    <TableRow key={ti.id}>
                      <TableCell className="font-semibold">{ti.connector.name}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel[ti.status] ?? ti.status}
                          tone={statusTone[ti.status] ?? "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={ti.enabled ? "Si" : "No"}
                          tone={ti.enabled ? "success" : "neutral"}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {ti.updatedAt.toLocaleDateString("es")}
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
