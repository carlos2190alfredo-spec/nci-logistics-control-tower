import Link from "next/link";
import {
  Building2,
  Edit,
  LifeBuoy,
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
import {
  endSupportSessionAction,
  startSupportSessionAction,
} from "@/lib/server/support-actions";
import {
  getActiveSupportSession,
  getTenantSupportHistory,
} from "@/lib/server/support-data";

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

  const [recentAudit, activeSupport, supportHistory] = await Promise.all([
    db.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    getActiveSupportSession(tenantId),
    getTenantSupportHistory(tenantId, 8),
  ]);

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

            {/* Modo soporte */}
            <Card>
              <CardHeader icon={<LifeBuoy />} title="Modo soporte" />
              <div className="mt-3">
                {activeSupport ? (
                  <>
                    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
                      <p className="font-semibold text-warning-foreground">Sesión activa</p>
                      <p className="mt-0.5 text-warning-foreground/90">
                        Motivo: {activeSupport.reason}
                      </p>
                      <p className="mt-0.5 text-xs text-warning-foreground/80">
                        Restan {activeSupport.minutesLeft} min ·{" "}
                        {activeSupport.expiresAt?.toLocaleString("es-PA") ?? "sin expiración"}
                      </p>
                    </div>
                    <form action={endSupportSessionAction} className="mt-3 grid gap-2">
                      <input name="sessionId" type="hidden" value={activeSupport.id} />
                      <textarea
                        className="min-h-16 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                        maxLength={500}
                        name="closeNotes"
                        placeholder="Notas de cierre (opcional)…"
                      />
                      <SubmitButton>Cerrar sesión de soporte</SubmitButton>
                    </form>
                  </>
                ) : (
                  <form action={startSupportSessionAction} className="grid gap-2.5">
                    <input name="tenantId" type="hidden" value={tenantId} />
                    <textarea
                      className="min-h-16 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                      maxLength={500}
                      name="reason"
                      placeholder="Motivo de la asistencia (obligatorio, ≥4 caracteres)"
                      required
                    />
                    <SelectField defaultValue="60" label="Duración" name="durationMinutes">
                      <option value="15">15 minutos</option>
                      <option value="30">30 minutos</option>
                      <option value="60">1 hora</option>
                      <option value="120">2 horas</option>
                      <option value="240">4 horas</option>
                    </SelectField>
                    <SubmitButton>Iniciar sesión de soporte</SubmitButton>
                  </form>
                )}
                {supportHistory.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Historial reciente
                    </p>
                    <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
                      {supportHistory.map((h) => (
                        <li className="flex items-start gap-2 border-b border-border pb-1.5" key={h.id}>
                          <span className="tabular-nums">{h.startedAt.toLocaleDateString("es-PA")}</span>
                          <span className="text-foreground">{h.reason}</span>
                          <span className="ml-auto">
                            {h.endedAt ? "cerrada" : h.expiresAt && h.expiresAt < new Date() ? "expirada" : "activa"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
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
