import Link from "next/link";
import {
  Brain,
  Building2,
  CheckCircle2,
  Circle,
  Link2,
  ListChecks,
  MessageSquare,
  Route,
  Truck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader, MetricCard, PageHeader, StatusBadge } from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

interface OnboardingStep {
  label: string;
  description: string;
  href: string;
  done: boolean;
}

export default async function TenantAdminPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  const db = getDb();
  const [
    memberCount,
    driverCount,
    tripCount,
    feedbackCount,
    pendingInvitations,
    vehicleCount,
    customerCount,
    integrationCount,
    aiSettingEnabled,
    serviceTypeCount,
  ] = await Promise.all([
    db.tenantMembership.count({ where: { tenantId: tenant.id, active: true } }),
    db.driver.count({ where: { tenantId: tenant.id } }),
    db.trip.count({ where: { tenantId: tenant.id } }),
    db.tenantFeedback.count({ where: { tenantId: tenant.id } }),
    db.userInvitation.count({ where: { tenantId: tenant.id, usedAt: null, expiresAt: { gt: new Date() } } }),
    db.vehicle.count({ where: { tenantId: tenant.id } }),
    db.customerAccount.count({ where: { tenantId: tenant.id } }),
    db.tenantIntegration.count({ where: { tenantId: tenant.id } }),
    db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id }, select: { enabled: true } }),
    db.serviceType.count({ where: { tenantId: tenant.id, active: true } }),
  ]);

  const base = `/t/${tenantSlug}/admin`;
  const steps: OnboardingStep[] = [
    {
      label: "Agregar usuarios",
      description: "Registra al menos un usuario adicional al tenant.",
      href: `${base}/users/new`,
      done: memberCount > 1,
    },
    {
      label: "Registrar conductores",
      description: "Agrega al menos un conductor para asignar a viajes.",
      href: `${base}/drivers/new`,
      done: driverCount > 0,
    },
    {
      label: "Configurar integraciones",
      description: "Revisa y configura los conectores disponibles.",
      href: `${base}/integrations`,
      done: integrationCount > 0,
    },
    {
      label: "Activar motor IA",
      description: "Habilita el motor de recomendaciones basadas en reglas.",
      href: `${base}/recommendations`,
      done: aiSettingEnabled?.enabled === true,
    },
    {
      label: "Crear primer viaje",
      description: "El tenant debe tener al menos un viaje registrado.",
      href: `/t/${tenantSlug}`,
      done: tripCount > 0,
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;
  const allDone = completedSteps === steps.length;

  return (
    <AppShell
      brandContext={tenant.name}
      brandName="Administracion"
      navGroups={getTenantAdminNavGroups(tenantSlug)}
      user={{ name: user.name, role: "Administrador" }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: tenant.name, href: `/t/${tenantSlug}` }, { label: "Administracion" }]}
          description="Panel de administracion del tenant."
          title={`Administracion — ${tenant.name}`}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<Users />} label="Miembros" value={memberCount} />
          <MetricCard icon={<Truck />} label="Conductores" value={driverCount} />
          <MetricCard icon={<Route />} label="Viajes totales" value={tripCount} />
          <MetricCard icon={<MessageSquare />} label="Feedback enviado" value={feedbackCount} />
          <MetricCard
            icon={<Building2 />}
            label="Invitaciones pendientes"
            tone={pendingInvitations > 0 ? "warning" : "default"}
            value={pendingInvitations}
          />
        </div>

        {!allDone && (
          <Card>
            <CardHeader
              description={`${completedSteps} de ${steps.length} pasos completados.`}
              icon={<ListChecks />}
              title="Checklist de configuracion"
            />
            <div className="mt-4 grid gap-0.5">
              {steps.map((step) => (
                <Link
                  key={step.label}
                  className="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover"
                  href={step.href}
                >
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-faint-foreground" />
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${step.done ? "text-faint-foreground line-through" : "text-foreground"}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-faint-foreground">{step.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {allDone && (
          <Card>
            <CardHeader
              description="Todos los pasos de configuracion inicial estan completos."
              icon={<CheckCircle2 />}
              title="Configuracion completa"
            />
            <p className="mt-2 text-sm text-faint-foreground">
              El tenant esta configurado y listo para operar. Usa el menu lateral para
              gestionar usuarios, conductores, integraciones y recomendaciones.
            </p>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader description="Resumen de recursos." icon={<Building2 />} title="Recursos" />
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Vehiculos</dt>
                <dd className="font-semibold">{vehicleCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Clientes</dt>
                <dd className="font-semibold">{customerCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Tipos de servicio</dt>
                <dd className="font-semibold">{serviceTypeCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Integraciones</dt>
                <dd className="font-semibold">{integrationCount}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader description="Accesos rapidos." icon={<Link2 />} title="Acciones" />
            <div className="mt-3 grid gap-2">
              <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${base}/users/new`}>
                Crear usuario
              </Link>
              <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${base}/drivers/new`}>
                Registrar conductor
              </Link>
              <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${base}/integrations`}>
                Configurar integraciones
              </Link>
              <Link className="text-sm font-semibold text-primary hover:text-primary-hover" href={`${base}/recommendations`}>
                Ver recomendaciones
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader description="Estado del tenant." icon={<Brain />} title="Inteligencia" />
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Motor IA</dt>
                <dd>
                  <StatusBadge
                    label={aiSettingEnabled?.enabled ? "Activo" : "Inactivo"}
                    tone={aiSettingEnabled?.enabled ? "success" : "neutral"}
                  />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Feedback enviado</dt>
                <dd className="font-semibold">{feedbackCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint-foreground">Demo</dt>
                <dd>
                  <StatusBadge
                    label={tenant.isDemo ? "Si" : "No"}
                    tone={tenant.isDemo ? "info" : "neutral"}
                  />
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
