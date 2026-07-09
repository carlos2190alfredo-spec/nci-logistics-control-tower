import {
  Activity,
  Bell,
  Eye,
  EyeOff,
  FileCheck2,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  Monitor,
  Route,
  Settings,
  Smartphone,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNavGroup } from "@/components/shell/shell-chrome";
import { TripMap } from "@/components/trip-map";
import { TripOperationsCard } from "@/components/operations/trip-operations-card";
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { confirmRequestAsTripAction } from "@/lib/server/actions";
import { requireTenantMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import {
  incidentPriorityLabel,
  incidentPriorityTone,
  incidentStatusLabel,
  incidentStatusTone,
  notificationChannelLabel,
  requestStatusLabel,
  requestStatusTone,
  tenantRoleLabel,
  tripStatusLabel,
  tripStatusTone,
} from "@/lib/ui/status";
import { formatDate, formatDateShort } from "@/lib/utils";

const channelIcon = {
  PORTAL: Monitor,
  EMAIL: Mail,
  MOCK_WHATSAPP: MessageCircle,
} as const;

export default async function TenantControlTowerPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantMembership(tenantSlug);
  const db = getDb();
  const [requests, activeTrips, closedTrips, vehicles, equipment, drivers, incidents, openIncidentCount, notifications] =
    await Promise.all([
      db.serviceRequest.findMany({
        where: { tenantId: tenant.id, status: { in: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"] } },
        include: { customerAccount: true, serviceType: true },
        orderBy: { createdAt: "desc" },
      }),
      db.trip.findMany({
        where: { tenantId: tenant.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
        include: {
          customerAccount: true,
          driver: true,
          vehicle: true,
          equipment: true,
          proof: true,
          documents: { orderBy: { createdAt: "desc" } },
          events: { orderBy: { createdAt: "desc" }, take: 4 },
        },
        orderBy: { scheduledAt: "asc" },
        take: 30,
      }),
      db.trip.findMany({
        where: { tenantId: tenant.id, status: { in: ["CLOSED", "CANCELLED"] } },
        include: { customerAccount: true },
        orderBy: { scheduledAt: "desc" },
        take: 6,
      }),
      db.vehicle.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
      db.equipment.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
      db.driver.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
      db.incident.findMany({
        where: { tenantId: tenant.id },
        include: { trip: { select: { reference: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.incident.count({
        where: { tenantId: tenant.id, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } },
      }),
      db.notificationDelivery.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const selectedTrip = activeTrips[0] ?? null;
  const pendingProofs = activeTrips.filter((trip) => trip.proof?.status === "SUBMITTED").length;
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
    ...(["TENANT_OWNER", "TENANT_ADMIN"].includes(membership.role)
      ? [
          {
            title: "Administracion",
            items: [{ label: "Configuracion", href: `${basePath}/settings`, icon: <Settings /> }],
          },
        ]
      : []),
  ];

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={navGroups}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[{ label: tenant.name }, { label: "Centro de control" }]}
          description={`Operacion en tiempo real: ${activeTrips.length} servicios en curso y ${requests.length} solicitudes por atender.`}
          meta={<StatusBadge label="Operacion en vivo" pulse tone="success" />}
          title={tenant.name}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            hint="Por revisar y convertir"
            href="#solicitudes"
            icon={<Inbox />}
            label="Solicitudes nuevas"
            tone="primary"
            value={requests.length}
          />
          <MetricCard hint="En ejecucion ahora" href="#viajes" icon={<Route />} label="Viajes activos" tone="primary" value={activeTrips.length} />
          <MetricCard
            hint={pendingProofs > 0 ? "Requieren revision de operaciones" : "Sin pendientes de revision"}
            href="#viajes"
            icon={<FileCheck2 />}
            label="Evidencias por aprobar"
            tone={pendingProofs > 0 ? "warning" : "default"}
            value={pendingProofs}
          />
          <MetricCard
            hint={openIncidentCount > 0 ? "Atencion requerida" : "Operacion sin novedades"}
            href="#incidencias"
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
          {/* Columna principal */}
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader
                description={selectedTrip ? `Siguiendo ${selectedTrip.reference}` : "Sin servicios en curso"}
                icon={<MapPin />}
                title="Mapa y seguimiento local"
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

            <section aria-labelledby="viajes-titulo" className="scroll-mt-20" id="viajes">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground" id="viajes-titulo">
                  <Route aria-hidden className="size-5 text-muted-foreground" />
                  Servicios operativos
                  <Badge tone="progress">{activeTrips.length}</Badge>
                </h2>
                <p className="text-xs text-faint-foreground">Ordenados por fecha programada</p>
              </div>
              {activeTrips.length ? (
                <div className="grid gap-4">
                  {activeTrips.map((trip, index) => (
                    <TripOperationsCard
                      drivers={drivers}
                      equipment={equipment}
                      index={index}
                      key={trip.id}
                      role={membership.role}
                      tenantSlug={tenantSlug}
                      trip={trip}
                      vehicles={vehicles}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  description="Confirme una solicitud de cliente para iniciar un nuevo servicio."
                  icon={<Route />}
                  title="No hay viajes activos"
                />
              )}
            </section>

            <Card className="scroll-mt-20" id="historial">
              <CardHeader
                description="Ultimos servicios cerrados o cancelados."
                icon={<History />}
                title="Historial reciente"
              />
              <div className="mt-4">
                {closedTrips.length ? (
                  <DataTable caption="Historial de servicios cerrados">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Referencia</TableHeaderCell>
                        <TableHeaderCell>Cliente</TableHeaderCell>
                        <TableHeaderCell>Estado</TableHeaderCell>
                        <TableHeaderCell>Programado</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {closedTrips.map((trip) => (
                        <TableRow key={trip.id}>
                          <TableCell className="font-mono font-semibold text-foreground">{trip.reference}</TableCell>
                          <TableCell>{trip.customerAccount.name}</TableCell>
                          <TableCell>
                            <StatusBadge label={tripStatusLabel[trip.status]} tone={tripStatusTone[trip.status]} />
                          </TableCell>
                          <TableCell numeric>{formatDateShort(trip.scheduledAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                ) : (
                  <EmptyState compact icon={<History />} title="Aun no hay servicios cerrados" />
                )}
              </div>
            </Card>
          </div>

          {/* Panel lateral */}
          <div className="grid min-w-0 content-start gap-6">
            <Card className="scroll-mt-20" id="solicitudes">
              <CardHeader
                description="Nuevas solicitudes del portal por convertir."
                icon={<Inbox />}
                title="Solicitudes de cliente"
              />
              <div className="mt-4 grid gap-3">
                {requests.length ? (
                  requests.map((request, index) => (
                    <div
                      className="anim-item rounded-lg border border-border bg-surface-sunken/50 p-3.5"
                      data-testid={`request-card-${request.id}`}
                      key={request.id}
                      style={{ "--stagger": index } as React.CSSProperties}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-sm font-bold text-foreground">{request.reference}</p>
                        <StatusBadge label={requestStatusLabel[request.status]} tone={requestStatusTone[request.status]} />
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{request.customerAccount.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {request.origin} → {request.destination}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-faint-foreground">
                        <span className="tabular-nums">{formatDateShort(request.requestedDate)}</span>
                        {request.priority === "URGENT" ? <Badge tone="danger">Urgente</Badge> : null}
                        <span>{request.serviceType.name}</span>
                      </div>
                      <form action={confirmRequestAsTripAction.bind(null, tenantSlug)} className="mt-3">
                        <input name="requestId" type="hidden" value={request.id} />
                        <SubmitButton className="w-full">Confirmar y convertir</SubmitButton>
                      </form>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    compact
                    description="Las solicitudes creadas por sus clientes apareceran aqui."
                    icon={<Inbox />}
                    title="No hay solicitudes pendientes"
                  />
                )}
              </div>
            </Card>

            <Card className="scroll-mt-20" id="incidencias">
              <CardHeader description="Reportes internos y visibles al cliente." icon={<TriangleAlert />} title="Incidencias" />
              <div className="mt-4 grid gap-3">
                {incidents.length ? (
                  incidents.map((incident) => (
                    <div className="rounded-lg border border-border p-3.5" key={incident.id}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{incident.category}</p>
                        <StatusBadge label={incidentStatusLabel[incident.status]} tone={incidentStatusTone[incident.status]} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {incident.customerMessage ?? incident.internalDescription}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint-foreground">
                        <Badge tone={incidentPriorityTone[incident.priority]}>{incidentPriorityLabel[incident.priority]}</Badge>
                        {incident.trip ? <span className="font-mono">{incident.trip.reference}</span> : null}
                        <span className="tabular-nums">{formatDateShort(incident.createdAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          {incident.visibleToCustomer ? (
                            <>
                              <Eye aria-hidden className="size-3" /> Visible al cliente
                            </>
                          ) : (
                            <>
                              <EyeOff aria-hidden className="size-3" /> Interna
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState compact description="La operacion no registra novedades." icon={<TriangleAlert />} title="Sin incidencias" />
                )}
              </div>
            </Card>

            <Card className="scroll-mt-20" id="actividad">
              <CardHeader description="Notificaciones emitidas por la plataforma." icon={<Bell />} title="Actividad reciente" />
              <div className="mt-4 grid gap-1">
                {notifications.length ? (
                  notifications.map((notification) => {
                    const ChannelIcon = channelIcon[notification.channel];
                    return (
                      <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60" key={notification.id}>
                        <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <ChannelIcon className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{notification.subject}</p>
                          <p className="text-xs text-faint-foreground">
                            {notificationChannelLabel[notification.channel]} · <span className="tabular-nums">{formatDateShort(notification.createdAt)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })
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
