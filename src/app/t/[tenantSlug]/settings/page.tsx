import {
  Activity,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  Monitor,
  Palette,
  Route,
  Settings,
  Smartphone,
  ToggleRight,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNavGroup } from "@/components/shell/shell-chrome";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { tenantRoleLabel } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const featureLabel: Record<string, string> = {
  portal: "Portal del cliente",
  driver_app: "PWA del conductor",
  notifications: "Notificaciones",
  reports: "Reportes",
  branding: "Branding propio",
  integrations: "Integraciones",
};

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const nearLimit = percent >= 80;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used}/{max}
        </span>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", nearLimit ? "bg-warning" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ColorSwatch({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span aria-hidden className="size-9 shrink-0 rounded-lg border border-border-strong shadow-xs" style={{ backgroundColor: value ?? "#e2e8f0" }} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="font-mono text-xs uppercase text-muted-foreground">{value ?? "Sin definir"}</p>
      </div>
    </div>
  );
}

export default async function TenantSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const db = getDb();
  const fullTenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    include: {
      branding: true,
      settings: true,
      plan: true,
      features: true,
      _count: { select: { memberships: true, drivers: true, vehicles: true, customers: true, documents: true } },
    },
  });
  const basePath = `/t/${tenantSlug}`;

  const navGroups: ShellNavGroup[] = [
    {
      title: "Operacion",
      items: [
        { label: "Centro de control", href: basePath, icon: <LayoutDashboard />, exact: true },
        { label: "Solicitudes", href: `${basePath}#solicitudes`, icon: <Inbox /> },
        { label: "Viajes activos", href: `${basePath}#viajes`, icon: <Route /> },
        { label: "Incidencias", href: `${basePath}#incidencias`, icon: <TriangleAlert /> },
        { label: "Actividad", href: `${basePath}#actividad`, icon: <Activity /> },
        { label: "Historial", href: `${basePath}#historial`, icon: <History /> },
      ],
    },
    {
      title: "Experiencias",
      items: [
        { label: "Portal cliente", href: `${basePath}/portal`, icon: <Monitor /> },
        ...(["DRIVER", "TENANT_OWNER", "DISPATCHER"].includes(membership.role)
          ? [{ label: "PWA conductor", href: `${basePath}/driver`, icon: <Smartphone /> }]
          : []),
      ],
    },
    {
      title: "Administracion",
      items: [{ label: "Configuracion", href: `${basePath}/settings`, icon: <Settings />, exact: true }],
    },
  ];

  return (
    <AppShell
      brandContext="Configuracion"
      brandName={tenant.name}
      navGroups={navGroups}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: basePath }, { label: "Configuracion" }]}
          description="Identidad visual, plan contratado, limites de uso y funciones habilitadas."
          title={`${tenant.name} - Configuracion`}
        />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              description="Colores y textos aplicados al portal de sus clientes."
              icon={<Palette />}
              title="Identidad visual"
            />
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Wordmark</p>
                <p className="mt-1 text-lg font-bold text-foreground">{fullTenant.branding?.wordmark ?? tenant.name}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ColorSwatch label="Primario" value={fullTenant.branding?.primary} />
                <ColorSwatch label="Secundario" value={fullTenant.branding?.secondary} />
                <ColorSwatch label="Acento" value={fullTenant.branding?.accent} />
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Pie de pagina</dt>
                  <dd className="font-medium text-foreground">{fullTenant.branding?.footerText}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Correo de soporte</dt>
                  <dd className="font-mono text-xs font-medium text-foreground">{fullTenant.branding?.supportMail}</dd>
                </div>
              </dl>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader
                description={`Plan ${fullTenant.plan.code} y consumo actual de los limites.`}
                icon={<Gauge />}
                title="Plan y limites"
              />
              <div className="mt-4 grid gap-4">
                <UsageBar label="Usuarios" max={fullTenant.plan.maxUsers} used={fullTenant._count.memberships} />
                <UsageBar label="Conductores" max={fullTenant.plan.maxDrivers} used={fullTenant._count.drivers} />
                <UsageBar label="Vehiculos" max={fullTenant.plan.maxVehicles} used={fullTenant._count.vehicles} />
                <UsageBar label="Clientes" max={fullTenant.plan.maxCustomers} used={fullTenant._count.customers} />
                <UsageBar label="Documentos" max={fullTenant.plan.maxDocuments} used={fullTenant._count.documents} />
              </div>
            </Card>

            <Card>
              <CardHeader description="Modulos habilitados segun el plan contratado." icon={<ToggleRight />} title="Funciones" />
              <div className="mt-4 flex flex-wrap gap-2">
                {fullTenant.features.map((feature) => (
                  <Badge key={feature.id} tone={feature.enabled ? "success" : "neutral"}>
                    {featureLabel[feature.key] ?? feature.key}: {feature.enabled ? "Activa" : "Inactiva"}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
