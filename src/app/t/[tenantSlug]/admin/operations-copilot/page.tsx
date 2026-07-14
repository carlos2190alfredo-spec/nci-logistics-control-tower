import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  MessageSquare,
  RefreshCcw,
  Shield,
  Truck,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
  SubmitButton,
} from "@/components/ui";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { requireTenantRole } from "@/lib/server/auth";
import { tenantRoleLabel } from "@/lib/ui/status";
import { getCopilotStatusAction } from "@/lib/server/copilot-actions";
import {
  generateOperationsSummaryAction,
  summarizeFeedbackAction,
  summarizeIncidentsAction,
} from "@/lib/server/copilot-actions";

export default async function OperationsCopilotPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
  ]);

  const status = await getCopilotStatusAction(tenantSlug);
  const navGroups = getTenantAdminNavGroups(tenantSlug);

  return (
    <AppShell
      brandContext="Administracion"
      brandName={tenant.name}
      navGroups={navGroups}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name },
            { label: "Administracion" },
            { label: "Copiloto IA" },
          ]}
          description="Asistente operativo con analisis inteligente. Las sugerencias son informativas — las decisiones son suyas."
          title="Copiloto IA"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Zap />}
            label="Proveedor"
            tone={status.health.available ? "success" : "warning"}
            value={
              status.health.provider === "deepseek"
                ? "DeepSeek"
                : status.health.provider === "rules"
                  ? "Reglas"
                  : "Desactivado"
            }
          />
          <MetricCard
            icon={<Activity />}
            label="Solicitudes hoy"
            tone="default"
            value={status.usage?.requestCount ?? 0}
          />
          <MetricCard
            icon={<CheckCircle />}
            label="Exitosas"
            tone="success"
            value={status.usage?.successCount ?? 0}
          />
          <MetricCard
            icon={<Shield />}
            label="Bloqueadas"
            tone={
              (status.usage?.blockedCount ?? 0) > 0 ? "danger" : "default"
            }
            value={status.usage?.blockedCount ?? 0}
          />
        </div>

        <Card>
          <CardHeader
            description={
              status.health.available
                ? `Modelo: ${status.health.model ?? "reglas"} · Proveedor activo`
                : "IA no configurada — se usa el motor de reglas determinista"
            }
            icon={<Bot />}
            title="Estado del proveedor"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge
              label={status.aiEnabled ? "IA activada" : "IA desactivada"}
              tone={status.aiEnabled ? "success" : "neutral"}
            />
            <StatusBadge
              label={status.health.configured ? "DeepSeek configurado" : "Sin API key"}
              tone={status.health.configured ? "info" : "neutral"}
            />
            <StatusBadge
              label={`Fallback: ${(status.usage?.fallbackCount ?? 0) > 0 ? status.usage?.fallbackCount + " hoy" : "ninguno"}`}
              tone={(status.usage?.fallbackCount ?? 0) > 0 ? "warning" : "neutral"}
            />
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader
              description="Genera un resumen ejecutivo del estado operativo actual."
              icon={<Truck />}
              title="Resumen operativo"
            />
            <form action={generateOperationsSummaryAction} className="mt-4">
              <input name="tenantSlug" type="hidden" value={tenantSlug} />
              <SubmitButton variant="outline">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Generar resumen
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader
              description="Analiza las tendencias del feedback recibido."
              icon={<MessageSquare />}
              title="Resumen de feedback"
            />
            <form action={summarizeFeedbackAction} className="mt-4">
              <input name="tenantSlug" type="hidden" value={tenantSlug} />
              <SubmitButton variant="outline">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Resumir feedback
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader
              description="Identifica patrones y tendencias en las incidencias."
              icon={<AlertTriangle />}
              title="Resumen de incidencias"
            />
            <form action={summarizeIncidentsAction} className="mt-4">
              <input name="tenantSlug" type="hidden" value={tenantSlug} />
              <SubmitButton variant="outline">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Resumir incidencias
              </SubmitButton>
            </form>
          </Card>
        </div>

        <Card>
          <CardHeader
            description="Historial de invocaciones recientes del copiloto."
            icon={<Clock />}
            title="Invocaciones recientes"
          />
          <div className="mt-4 grid gap-2">
            {status.recentInvocations.length > 0 ? (
              status.recentInvocations.map((inv) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken/50 px-4 py-2.5 text-sm"
                  key={inv.id}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      label={inv.status === "SUCCESS" ? "OK" : inv.status === "BLOCKED" ? "Bloq" : inv.fallbackUsed ? "Fallback" : "Error"}
                      tone={inv.status === "SUCCESS" ? "success" : inv.status === "BLOCKED" ? "danger" : inv.fallbackUsed ? "warning" : "danger"}
                    />
                    <span className="text-foreground">{purposeLabel(inv.purpose)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{inv.provider}</span>
                    <span className="tabular-nums">{inv.durationMs}ms</span>
                    <span>{formatDate(inv.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                compact
                description="Las invocaciones del copiloto apareceran aqui."
                icon={<Bot />}
                title="Sin invocaciones"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function purposeLabel(purpose: string): string {
  const labels: Record<string, string> = {
    operations_summary: "Resumen operativo",
    trip_risk: "Riesgo de viaje",
    driver_recommendation_explanation: "Explicacion de recomendacion",
    feedback_summary: "Resumen de feedback",
    incident_summary: "Resumen de incidencias",
    alert_explanation: "Explicacion de alerta",
    daily_digest: "Resumen diario",
  };
  return labels[purpose] ?? purpose;
}

function formatDate(date: Date): string {
  return date.toLocaleString("es-MX", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
