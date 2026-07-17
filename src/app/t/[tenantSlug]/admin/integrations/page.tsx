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
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { CONNECTOR_CATALOG } from "@/lib/integrations/registry";
import { getConnectorHealth } from "@/lib/server/connector-health-data";
import { toggleIntegrationAction, testIntegrationAction } from "@/lib/server/integration-actions";
import type { ConnectorHealth } from "@/lib/integrations/health";
import type { StatusTone } from "@/lib/ui/status";

const healthLabel: Record<ConnectorHealth, string> = {
  DESACTIVADO: "Desactivado",
  REQUIERE_CREDENCIALES: "Requiere credenciales",
  ACTIVO: "Activo",
  DEGRADADO: "Degradado",
  ERROR: "Error",
};

const healthTone: Record<ConnectorHealth, StatusTone> = {
  DESACTIVADO: "neutral",
  REQUIERE_CREDENCIALES: "warning",
  ACTIVO: "success",
  DEGRADADO: "warning",
  ERROR: "danger",
};

function formatSync(d: Date | null): string {
  if (!d) return "Nunca";
  return d.toLocaleDateString("es-PA", { year: "numeric", month: "short", day: "numeric" });
}

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
    include: {
      connector: true,
      credentials: { select: { key: true } },
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const connectorMap = new Map(
    tenantIntegrations.map((ti) => [ti.connector.type, ti]),
  );

  const enabledCount = tenantIntegrations.filter((ti) => ti.enabled).length;
  const configuredCount = tenantIntegrations.length;

  const events = await db.integrationEvent.findMany({
    where: { tenantIntegration: { tenantId: tenant.id } },
    include: { tenantIntegration: { include: { connector: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const health = await getConnectorHealth(tenant.id);

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
          description="Configura y gestiona los conectores de integracion del tenant."
          title="Integraciones"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<Link2 />} label="Disponibles" value={CONNECTOR_CATALOG.length} />
          <MetricCard icon={<Link2 />} label="Configuradas" value={configuredCount} />
          <MetricCard icon={<Link2 />} label="Activas" tone="success" value={enabledCount} />
        </div>

        <Card>
          <CardHeader
            description="Estado operativo de cada conector: credenciales, sincronizacion y errores recientes."
            icon={<Link2 />}
            title="Salud de conectores"
          />
          <div className="mt-4 overflow-x-auto">
            <DataTable caption="Salud de conectores">
              <TableHead>
                <tr>
                  <TableHeaderCell>Conector</TableHeaderCell>
                  <TableHeaderCell>Salud</TableHeaderCell>
                  <TableHeaderCell>Credenciales</TableHeaderCell>
                  <TableHeaderCell>Ult. sync</TableHeaderCell>
                  <TableHeaderCell>Eventos (7d)</TableHeaderCell>
                  <TableHeaderCell>Accion recomendada</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {health.map((h) => (
                  <TableRow key={h.type}>
                    <TableCell className="font-medium text-foreground">{h.name}</TableCell>
                    <TableCell>
                      <StatusBadge label={healthLabel[h.result.health]} tone={healthTone[h.result.health]} />
                    </TableCell>
                    <TableCell numeric>
                      {h.presentCredentials}/{h.requiredCredentials}
                    </TableCell>
                    <TableCell>{formatSync(h.lastSyncAt)}</TableCell>
                    <TableCell numeric>
                      {h.recentProcessed} ok
                      {h.recentFailed > 0 ? <span className="text-danger"> · {h.recentFailed} fallo(s)</span> : null}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{h.result.recommendedAction}</span>
                      {h.lastError ? (
                        <span className="mt-0.5 block text-xs text-danger">{h.lastError}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        <Card>
          <CardHeader
            description="Conectores disponibles. Configura credenciales y activa segun necesidad."
            icon={<Link2 />}
            title="Catalogo de conectores"
          />
          <div className="mt-4">
            <DataTable caption="Conectores de integracion">
              <TableHead>
                <tr>
                  <TableHeaderCell>Conector</TableHeaderCell>
                  <TableHeaderCell>Descripcion</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Credenciales</TableHeaderCell>
                  <TableHeaderCell>Eventos</TableHeaderCell>
                  <TableHeaderCell><span className="sr-only">Acciones</span></TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {CONNECTOR_CATALOG.map((c) => {
                  const ti = connectorMap.get(c.type);
                  const status = ti?.status ?? "DISABLED";
                  const credCount = ti?.credentials?.length ?? 0;
                  const eventCount = ti?._count?.events ?? 0;
                  return (
                    <TableRow key={c.type}>
                      <TableCell>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-faint-foreground">v{c.version}</p>
                      </TableCell>
                      <TableCell className="text-sm text-faint-foreground max-w-xs">{c.description}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel[status] ?? status}
                          tone={statusTone[status] ?? "neutral"}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {credCount > 0 ? `${credCount} clave(s)` : "—"}
                      </TableCell>
                      <TableCell className="text-sm" numeric>
                        {eventCount}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            className="text-sm font-semibold text-primary hover:text-primary-hover"
                            href={`/t/${tenantSlug}/admin/integrations/${c.type.toLowerCase()}`}
                          >
                            Configurar
                          </Link>
                          {ti && (
                            <>
                              <form action={toggleIntegrationAction}>
                                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                                <input type="hidden" name="integrationId" value={ti.id} />
                                <button
                                  className={`text-xs font-semibold px-2 py-1 rounded ${ti.enabled ? "text-danger hover:text-danger/80" : "text-success hover:text-success/80"}`}
                                  type="submit"
                                >
                                  {ti.enabled ? "Desactivar" : "Activar"}
                                </button>
                              </form>
                              <form action={testIntegrationAction}>
                                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                                <input type="hidden" name="integrationId" value={ti.id} />
                                <button
                                  className="text-xs font-semibold text-info hover:text-info/80 px-2 py-1"
                                  type="submit"
                                >
                                  Probar
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          </div>
        </Card>

        {events.length > 0 && (
          <Card>
            <CardHeader
              description="Historial reciente de eventos de integracion."
              icon={<Link2 />}
              title="Eventos recientes"
            />
            <div className="mt-4">
              <DataTable caption="Eventos de integracion">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Conector</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Direccion</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-semibold">{e.tenantIntegration.connector.name}</TableCell>
                      <TableCell><code className="text-xs">{e.eventType}</code></TableCell>
                      <TableCell className="text-xs">{e.direction}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={e.status}
                          tone={e.status === "COMPLETED" ? "success" : e.status === "FAILED" ? "danger" : "neutral"}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-faint-foreground">
                        {e.createdAt.toLocaleString("es")}
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
