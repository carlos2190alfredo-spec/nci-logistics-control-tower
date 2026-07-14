import {
  AlertTriangle,
  Calendar,
  Clock,
  MapPin,
  Route,
  Smartphone,
  Truck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { getTenantAdminNavGroups } from "@/lib/ui/tenant-admin-nav";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { tenantRoleLabel } from "@/lib/ui/status";

interface InsightItem {
  title: string;
  description: string;
  tone: "warning" | "danger" | "info" | "neutral";
  icon: React.ReactNode;
}

export default async function OperationsInsightsPage({
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

  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [
    tripsWithoutDriver,
    tripsWithoutEstimate,
    driversWithoutSchedule,
    overloadedDrivers,
    activeTripsCount,
    totalDrivers,
    recentRecommendations,
  ] = await Promise.all([
    db.trip.count({
      where: {
        tenantId: tenant.id,
        driverId: null,
        status: { notIn: ["CANCELLED", "CLOSED"] },
      },
    }),
    db.trip.count({
      where: {
        tenantId: tenant.id,
        status: { notIn: ["CANCELLED", "CLOSED"] },
        routeEstimates: { none: {} },
      },
    }),
    db.driver.count({
      where: {
        tenantId: tenant.id,
        status: "AVAILABLE",
        workSchedules: { none: {} },
      },
    }),
    db.driver.findMany({
      where: {
        tenantId: tenant.id,
        status: "AVAILABLE",
        trips: {
          some: {
            scheduledAt: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ["CANCELLED", "CLOSED"] },
          },
        },
      },
      include: {
        trips: {
          where: {
            scheduledAt: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ["CANCELLED", "CLOSED"] },
          },
          select: { id: true },
        },
      },
    }),
    db.trip.count({
      where: {
        tenantId: tenant.id,
        status: { notIn: ["CANCELLED", "CLOSED"] },
      },
    }),
    db.driver.count({
      where: { tenantId: tenant.id, status: "AVAILABLE" },
    }),
    db.driverAssignmentRecommendation.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        driver: { select: { name: true, code: true } },
        trip: { select: { reference: true } },
      },
    }),
  ]);

  const highLoadDrivers = overloadedDrivers.filter((d) => d.trips.length >= 4);

  const insights: InsightItem[] = [];

  if (tripsWithoutDriver > 0) {
    insights.push({
      title: `${tripsWithoutDriver} viaje(s) sin conductor asignado`,
      description: "Estos viajes necesitan un conductor para poder ejecutarse.",
      tone: "danger",
      icon: <Users />,
    });
  }

  if (tripsWithoutEstimate > 0) {
    insights.push({
      title: `${tripsWithoutEstimate} viaje(s) sin estimacion de ruta`,
      description: "Calcule estimaciones para mejorar la planificacion.",
      tone: "warning",
      icon: <Route />,
    });
  }

  if (driversWithoutSchedule > 0) {
    insights.push({
      title: `${driversWithoutSchedule} conductor(es) sin horario configurado`,
      description: "Configure horarios laborales para habilitar recomendaciones automaticas.",
      tone: "warning",
      icon: <Calendar />,
    });
  }

  if (highLoadDrivers.length > 0) {
    insights.push({
      title: `${highLoadDrivers.length} conductor(es) con alta carga hoy`,
      description: `Conductores con 4+ viajes asignados hoy: ${highLoadDrivers.map((d) => d.name).join(", ")}.`,
      tone: "warning",
      icon: <Truck />,
    });
  }

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
          breadcrumbs={[{ label: tenant.name }, { label: "Administracion" }, { label: "Operaciones IA" }]}
          description="Insights operativos generados automaticamente para optimizar la asignacion de recursos."
          title="Operaciones e Inteligencia"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Route />}
            label="Viajes activos"
            tone="primary"
            value={activeTripsCount}
          />
          <MetricCard
            icon={<Users />}
            label="Conductores disponibles"
            tone="primary"
            value={totalDrivers}
          />
          <MetricCard
            hint="Sin conductor asignado"
            icon={<AlertTriangle />}
            label="Sin conductor"
            tone={tripsWithoutDriver > 0 ? "danger" : "success"}
            value={tripsWithoutDriver}
          />
          <MetricCard
            hint="Sin estimacion de ruta"
            icon={<MapPin />}
            label="Sin ETA"
            tone={tripsWithoutEstimate > 0 ? "warning" : "success"}
            value={tripsWithoutEstimate}
          />
        </div>

        <Card>
          <CardHeader
            description="Problemas detectados que requieren atencion."
            icon={<AlertTriangle />}
            title="Alertas operativas"
          />
          <div className="mt-4 grid gap-3">
            {insights.length > 0 ? (
              insights.map((insight, i) => (
                <div
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface-sunken/50 p-4"
                  key={i}
                >
                  <span className="mt-0.5 text-muted-foreground">{insight.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{insight.title}</p>
                      <StatusBadge
                        label={insight.tone === "danger" ? "Critico" : insight.tone === "warning" ? "Atencion" : "Info"}
                        tone={insight.tone}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                compact
                description="La operacion no presenta alertas activas."
                icon={<AlertTriangle />}
                title="Sin alertas"
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            description="Ultimas recomendaciones de conductor generadas por el motor de reglas."
            icon={<Truck />}
            title="Recomendaciones recientes"
          />
          <div className="mt-4 grid gap-3">
            {recentRecommendations.length > 0 ? (
              recentRecommendations.map((rec) => (
                <div
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-sunken/50 p-3.5"
                  key={rec.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{rec.recommendationTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{rec.explanation}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-faint-foreground">
                      {rec.trip ? (
                        <span className="font-mono">{rec.trip.reference}</span>
                      ) : null}
                      {rec.driver ? (
                        <span>{rec.driver.name} ({rec.driver.code})</span>
                      ) : null}
                      <span className="tabular-nums">Score: {rec.score}</span>
                    </div>
                  </div>
                  <StatusBadge
                    label={
                      rec.status === "GENERATED"
                        ? "Generada"
                        : rec.status === "ACCEPTED"
                          ? "Aceptada"
                          : rec.status === "OVERRIDDEN"
                            ? "Anulada"
                            : "Descartada"
                    }
                    tone={
                      rec.status === "ACCEPTED"
                        ? "success"
                        : rec.status === "OVERRIDDEN"
                          ? "warning"
                          : rec.status === "DISMISSED"
                            ? "neutral"
                            : "info"
                    }
                  />
                </div>
              ))
            ) : (
              <EmptyState
                compact
                description="Genere recomendaciones desde la creacion de viajes."
                icon={<Truck />}
                title="Sin recomendaciones"
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
