import Link from "next/link";
import {
  Building2,
  Edit,
  MessageSquare,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  MetricCard,
  PageHeader,
  StatusBadge,
  SubmitButton,
  SelectField,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Timeline,
  TimelineItem,
} from "@/components/ui";
import { buttonStyles } from "@/components/ui/button-styles";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getPlatformNavGroups, platformRoleLabel } from "@/lib/ui/platform-nav";
import { tenantRoleLabel, tenantStatusLabel, tenantStatusTone } from "@/lib/ui/status";
import { changeTenantStatusAction, changeTenantPlanAction } from "@/lib/server/tenant-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const { tenantId } = await params;
  const db = getDb();

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan: true,
      branding: true,
      settings: true,
      features: true,
      memberships: { include: { user: true }, where: { active: true }, orderBy: { createdAt: "desc" } },
      _count: {
        select: {
          trips: true,
          customers: true,
          memberships: true,
          feedback: true,
          drivers: true,
          vehicles: true,
          equipment: true,
          documents: true,
          tenantIntegrations: true,
          auditLogs: true,
        },
      },
    },
  });

  if (!tenant) notFound();

  const recentAudit = await db.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const isSuperAdmin = user.platformRole === "PLATFORM_SUPER_ADMIN";

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("es-PA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <AppShell
      brandContext="Panel de plataforma"
      brandName="NCI Automation"
      navGroups={getPlatformNavGroups()}
      user={{ name: user.name, role: user.platformRole ? platformRoleLabel[user.platformRole] : "Plataforma" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Plataforma", href: "/platform" },
            { label: "Tenants", href: "/platform/tenants" },
            { label: tenant.name },
          ]}
          description={`${tenant.legalName} · /${tenant.slug}`}
          title={tenant.name}
          actions={
            isSuperAdmin ? (
              <Link className={buttonStyles({ variant: "secondary" })} href={`/platform/tenants/${tenantId}/edit`}>
                <Edit aria-hidden className="size-4" />
                Editar
              </Link>
            ) : undefined
          }
        />

        <div className="flex flex-wrap gap-2">
          <StatusBadge label={tenantStatusLabel[tenant.status]} tone={tenantStatusTone[tenant.status]} />
          <Badge tone="neutral">{tenant.plan.name}</Badge>
          <Badge tone={tenant.subscriptionStatus === "ACTIVE" ? "success" : tenant.subscriptionStatus === "TRIAL" ? "info" : "warning"}>
            {tenant.subscriptionStatus}
          </Badge>
          {tenant.isDemo && <Badge tone="info">Demo</Badge>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Users />} label="Usuarios" tone="primary" value={tenant._count.memberships} />
          <MetricCard icon={<Route />} label="Viajes" tone="success" value={tenant._count.trips} />
          <MetricCard icon={<Building2 />} label="Clientes" value={tenant._count.customers} />
          <MetricCard icon={<MessageSquare />} label="Feedback" value={tenant._count.feedback} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="grid gap-6">
            {/* Informacion general */}
            <Card>
              <CardHeader icon={<Building2 />} title="Informacion general" />
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <DItem label="Pais" value={tenant.country} />
                <DItem label="Moneda" value={tenant.currency} />
                <DItem label="Contacto" value={tenant.contactName || "—"} />
                <DItem label="Correo contacto" value={tenant.contactEmail || "—"} />
                <DItem label="Telefono" value={tenant.contactPhone || "—"} />
                <DItem label="RUC / Tax ID" value={tenant.taxId || "—"} />
                <DItem label="Creado" value={fmt(tenant.createdAt)} />
                <DItem label="Activado" value={fmt(tenant.activatedAt)} />
                {tenant.internalNotes && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Notas internas</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{tenant.internalNotes}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* Usuarios */}
            <Card>
              <CardHeader
                description={`${tenant.memberships.length} miembros activos`}
                icon={<Users />}
                title="Usuarios del tenant"
              />
              <div className="mt-4">
                <DataTable caption="Usuarios activos del tenant">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Nombre</TableHeaderCell>
                      <TableHeaderCell>Correo</TableHeaderCell>
                      <TableHeaderCell>Rol</TableHeaderCell>
                      <TableHeaderCell>Desde</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {tenant.memberships.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.user.name}</TableCell>
                        <TableCell><span className="text-xs">{m.user.email}</span></TableCell>
                        <TableCell>
                          <Badge tone="neutral">{tenantRoleLabel[m.role]}</Badge>
                        </TableCell>
                        <TableCell>{fmt(m.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>
            </Card>

            {/* Modulos habilitados */}
            <Card>
              <CardHeader icon={<ShieldCheck />} title="Modulos y limites del plan" />
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <DItem label="Max usuarios" value={String(tenant.plan.maxUsers)} />
                <DItem label="Max conductores" value={String(tenant.plan.maxDrivers)} />
                <DItem label="Max vehiculos" value={String(tenant.plan.maxVehicles)} />
                <DItem label="Max clientes" value={String(tenant.plan.maxCustomers)} />
                <DItem label="Max documentos" value={String(tenant.plan.maxDocuments)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {tenant.features.map((f) => (
                  <Badge key={f.id} tone={f.enabled ? "success" : "neutral"}>
                    {f.key}: {f.enabled ? "Si" : "No"}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-6">
            {/* Acciones */}
            {isSuperAdmin && (
              <Card>
                <CardHeader title="Acciones" />
                <div className="mt-4 grid gap-4">
                  {tenant.status === "ACTIVE" && (
                    <form action={changeTenantStatusAction}>
                      <input name="tenantId" type="hidden" value={tenantId} />
                      <input name="action" type="hidden" value="suspend" />
                      <SubmitButton variant="danger">Suspender tenant</SubmitButton>
                    </form>
                  )}
                  {tenant.status === "SUSPENDED" && (
                    <form action={changeTenantStatusAction}>
                      <input name="tenantId" type="hidden" value={tenantId} />
                      <input name="action" type="hidden" value="reactivate" />
                      <SubmitButton variant="accent">Reactivar tenant</SubmitButton>
                    </form>
                  )}
                  {(tenant.status === "ACTIVE" || tenant.status === "SUSPENDED") && (
                    <form action={changeTenantStatusAction}>
                      <input name="tenantId" type="hidden" value={tenantId} />
                      <input name="action" type="hidden" value="archive" />
                      <SubmitButton variant="secondary">Archivar tenant</SubmitButton>
                    </form>
                  )}

                  <form action={changeTenantPlanAction} className="grid gap-2">
                    <input name="tenantId" type="hidden" value={tenantId} />
                    <SelectField label="Cambiar plan" name="planCode">
                      <option value="DEMO">Demo</option>
                      <option value="STARTER">Starter</option>
                      <option value="PROFESSIONAL">Professional</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </SelectField>
                    <SubmitButton variant="secondary">Aplicar plan</SubmitButton>
                  </form>
                </div>
              </Card>
            )}

            {/* Estadisticas adicionales */}
            <Card>
              <CardHeader title="Recursos" />
              <dl className="mt-4 grid gap-2 text-sm">
                <DItem label="Conductores" value={String(tenant._count.drivers)} />
                <DItem label="Vehiculos" value={String(tenant._count.vehicles)} />
                <DItem label="Equipos" value={String(tenant._count.equipment)} />
                <DItem label="Documentos" value={String(tenant._count.documents)} />
                <DItem label="Integraciones" value={String(tenant._count.tenantIntegrations)} />
                <DItem label="Registros de auditoria" value={String(tenant._count.auditLogs)} />
              </dl>
            </Card>

            {/* Actividad reciente */}
            <Card>
              <CardHeader title="Actividad reciente" />
              <div className="mt-4">
                {recentAudit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
                ) : (
                  <Timeline>
                    {recentAudit.map((log, i) => (
                      <TimelineItem
                        key={log.id}
                        title={log.action}
                        description={`${log.entity}${log.entityId ? ` (${log.entityId.slice(0, 8)}...)` : ""}`}
                        meta={new Date(log.createdAt).toLocaleString("es-PA")}
                        isLast={i === recentAudit.length - 1}
                      />
                    ))}
                  </Timeline>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function DItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
