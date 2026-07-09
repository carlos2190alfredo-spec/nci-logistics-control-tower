import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card } from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export default async function TenantSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const db = getDb();
  const fullTenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    include: { branding: true, settings: true, plan: true, features: true, _count: { select: { memberships: true, drivers: true, vehicles: true, customers: true, documents: true } } },
  });

  return (
    <AppShell
      title={`${tenant.name} - Configuracion`}
      subtitle="Branding, plan, limites y feature flags"
      nav={<Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}`}>Centro de control</Link>}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Identidad visual</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <p><strong>Wordmark:</strong> {fullTenant.branding?.wordmark}</p>
            <p><strong>Primario:</strong> {fullTenant.branding?.primary}</p>
            <p><strong>Secundario:</strong> {fullTenant.branding?.secondary}</p>
            <p><strong>Acento:</strong> {fullTenant.branding?.accent}</p>
            <p><strong>Pie:</strong> {fullTenant.branding?.footerText}</p>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Plan y limites</h2>
          <div className="mt-4 grid gap-2 text-sm">
            <p><strong>Plan:</strong> {fullTenant.plan.code}</p>
            <p>Usuarios {fullTenant._count.memberships}/{fullTenant.plan.maxUsers}</p>
            <p>Conductores {fullTenant._count.drivers}/{fullTenant.plan.maxDrivers}</p>
            <p>Vehiculos {fullTenant._count.vehicles}/{fullTenant.plan.maxVehicles}</p>
            <p>Clientes {fullTenant._count.customers}/{fullTenant.plan.maxCustomers}</p>
            <p>Documentos {fullTenant._count.documents}/{fullTenant.plan.maxDocuments}</p>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold">Feature flags</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {fullTenant.features.map((feature) => (
              <Badge key={feature.id} tone={feature.enabled ? "green" : "slate"}>{feature.key}: {feature.enabled ? "ON" : "OFF"}</Badge>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
