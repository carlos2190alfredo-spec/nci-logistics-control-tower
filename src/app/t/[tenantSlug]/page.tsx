import Link from "next/link";
import {
  Bell,
  FileCheck2,
  Inbox,
  MapPin,
  Route,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { TripMap } from "@/components/trip-map";
import {
  Card,
  CardHeader,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { ActivityItem } from "@/components/tenant/activity-item";
import { IncidentCard } from "@/components/tenant/incident-card";
import { RequestCard } from "@/components/tenant/request-card";
import { requireTenantMembership } from "@/lib/server/auth";
import { getTenantOverview } from "@/lib/server/tenant-dashboard-data";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import {
  tenantRoleLabel,
  tripStatusLabel,
  tripStatusTone,
} from "@/lib/ui/status";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TenantControlTowerPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const {
    requests,
    activeTrips,
    vehicles,
    equipment,
    drivers,
    incidents,
    openIncidentCount,
    notifications,
    pendingProofs,
  } = await getTenantOverview(tenant.id);

  const selectedTrip = activeTrips[0];
  const base = `/t/${tenantSlug}`;

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: tenant.name }, { label: "Resumen" }]}
          description={`Operacion en tiempo real: ${activeTrips.length} servicios en curso y ${requests.length} solicitudes por atender.`}
          meta={<StatusBadge label="Operacion en vivo" pulse tone="success" />}
          title={tenant.name}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            hint="Por revisar y convertir"
            href={`${base}/requests`}
            icon={<Inbox />}
            label="Solicitudes nuevas"
            tone="primary"
            value={requests.length}
          />
          <MetricCard
            hint="En ejecucion ahora"
            href={`${base}/trips`}
            icon={<Route />}
            label="Viajes activos"
            tone="primary"
            value={activeTrips.length}
          />
          <MetricCard
            hint={pendingProofs > 0 ? "Requieren revision de operaciones" : "Sin pendientes de revision"}
            href={`${base}/trips`}
            icon={<FileCheck2 />}
            label="Evidencias por aprobar"
            tone={pendingProofs > 0 ? "warning" : "default"}
            value={pendingProofs}
          />
          <MetricCard
            hint={openIncidentCount > 0 ? "Atencion requerida" : "Operacion sin novedades"}
            href={`${base}/incidents`}
            icon={<TriangleAlert />}
            label="Incidencias abiertas"
            tone={openIncidentCount > 0 ? "danger" : "success"}
            value={openIncidentCount}
          />
          <MetricCard
            hint={`${drivers.length} conductores · ${equipment.length} equipos`}
            icon={<Truck />}
            label="Flota disponible"
            value={vehicles.length}
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader
                description={selectedTrip ? `Siguiendo ${selectedTrip.reference}` : "Sin servicios en curso"}
                icon={<MapPin />}
                title="Mapa y seguimiento"
              />
              {selectedTrip ? (
                <div className="anim-scale-in mt-4">
                  <TripMap
                    expectedDuration={selectedTrip.expectedDuration}
                    routePoints={selectedTrip.routePoints}
                    simulationPausedAt={selectedTrip.simulationPausedAt}
                    simulationProgress={selectedTrip.simulationProgress}
                    simulationStartedAt={selectedTrip.simulationStartedAt}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{selectedTrip.reference}</span>
                    <StatusBadge label={tripStatusLabel[selectedTrip.status]} tone={tripStatusTone[selectedTrip.status]} />
                    <span className="tabular-nums">ETA {formatDate(selectedTrip.eta)}</span>
                    <Link className="ml-auto text-sm font-medium text-primary hover:underline" href={`${base}/trips`}>
                      Ver todos los viajes →
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState
                  className="mt-4"
                  description="Cuando exista un servicio en curso, su avance se mostrara aqui."
                  icon={<MapPin />}
                  title="Sin viajes en seguimiento"
                />
              )}
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <CardHeader
                  description={`Ultimas ${Math.min(activeTrips.length, 3)} de ${activeTrips.length} en curso`}
                  icon={<Route />}
                  title="Viajes activos"
                />
                <Link className="mt-1 shrink-0 text-sm font-medium text-primary hover:underline" href={`${base}/trips`}>
                  Ver todos →
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                {activeTrips.slice(0, 3).map((trip) => (
                  <Link
                    className="rounded-lg border border-border p-3.5 transition-colors hover:bg-muted/60"
                    href={`${base}/trips`}
                    key={trip.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-sm font-bold text-foreground">{trip.reference}</p>
                      <StatusBadge label={tripStatusLabel[trip.status]} tone={tripStatusTone[trip.status]} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">{trip.customerAccount.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {trip.driver?.name ?? "Sin conductor"} · {trip.vehicle?.plate ?? "Sin vehiculo"}
                    </p>
                  </Link>
                ))}
                {activeTrips.length === 0 ? (
                  <EmptyState
                    compact
                    description="Confirme una solicitud de cliente para iniciar un nuevo servicio."
                    icon={<Route />}
                    title="No hay viajes activos"
                  />
                ) : null}
              </div>
            </Card>
          </div>

          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <CardHeader description="Ultimas solicitudes por convertir" icon={<Inbox />} title="Solicitudes" />
                <Link className="mt-1 shrink-0 text-sm font-medium text-primary hover:underline" href={`${base}/requests`}>
                  Ver todas →
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                {requests.length ? (
                  requests.slice(0, 3).map((r, i) => (
                    <RequestCard index={i} key={r.id} request={r} tenantSlug={tenantSlug} />
                  ))
                ) : (
                  <EmptyState compact icon={<Inbox />} title="Sin solicitudes pendientes" />
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <CardHeader description="Reportes recientes" icon={<TriangleAlert />} title="Incidencias" />
                <Link className="mt-1 shrink-0 text-sm font-medium text-primary hover:underline" href={`${base}/incidents`}>
                  Ver todas →
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                {incidents.length ? (
                  incidents.slice(0, 3).map((i) => <IncidentCard incident={i} key={i.id} />)
                ) : (
                  <EmptyState compact icon={<TriangleAlert />} title="Sin incidencias" />
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <CardHeader description="Notificaciones recientes" icon={<Bell />} title="Actividad" />
                <Link className="mt-1 shrink-0 text-sm font-medium text-primary hover:underline" href={`${base}/activity`}>
                  Ver todas →
                </Link>
              </div>
              <div className="mt-4 grid gap-1">
                {notifications.length ? (
                  notifications.slice(0, 5).map((n) => <ActivityItem key={n.id} notification={n} />)
                ) : (
                  <EmptyState compact icon={<Bell />} title="Sin actividad reciente" />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
