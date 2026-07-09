import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TripMap } from "@/components/trip-map";
import { Badge, Card, SubmitButton, TextArea } from "@/components/ui";
import { approveProofAction, assignTripAction, confirmRequestAsTripAction, reportIncidentAction, transitionTripAction } from "@/lib/server/actions";
import { requireTenantMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { nextStatuses } from "@/lib/domain/state-machine";
import { formatDate } from "@/lib/utils";

export default async function TenantControlTowerPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { tenant, membership } = await requireTenantMembership(tenantSlug);
  const db = getDb();
  const [requests, trips, vehicles, equipment, drivers, incidents, notifications] = await Promise.all([
    db.serviceRequest.findMany({
      where: { tenantId: tenant.id, status: { in: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"] } },
      include: { customerAccount: true, serviceType: true },
      orderBy: { createdAt: "desc" },
    }),
    db.trip.findMany({
      where: { tenantId: tenant.id },
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
      take: 20,
    }),
    db.vehicle.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
    db.equipment.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
    db.driver.findMany({ where: { tenantId: tenant.id, status: "AVAILABLE" }, orderBy: { code: "asc" } }),
    db.incident.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notificationDelivery.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const activeTrips = trips.filter((trip) => !["CLOSED", "CANCELLED"].includes(trip.status));
  const selectedTrip = activeTrips[0] ?? trips[0];

  return (
    <AppShell
      title={tenant.name}
      subtitle={`Centro de Control - rol ${membership.role}`}
      nav={
        <>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}/portal`}>Portal cliente</Link>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}/driver`}>PWA conductor</Link>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}/settings`}>Configuracion</Link>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Solicitudes nuevas</p><p className="mt-2 text-3xl font-bold">{requests.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Servicios activos</p><p className="mt-2 text-3xl font-bold">{activeTrips.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Incidencias</p><p className="mt-2 text-3xl font-bold">{incidents.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Notificaciones</p><p className="mt-2 text-3xl font-bold">{notifications.length}</p></Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-bold">Mapa y seguimiento local</h2>
          {selectedTrip ? (
            <div className="mt-4">
              <TripMap
                routePoints={selectedTrip.routePoints}
                simulationStartedAt={selectedTrip.simulationStartedAt}
                simulationPausedAt={selectedTrip.simulationPausedAt}
                simulationProgress={selectedTrip.simulationProgress}
                expectedDuration={selectedTrip.expectedDuration}
              />
              <p className="mt-3 text-sm text-slate-600">
                {selectedTrip.reference} - {selectedTrip.customerVisibleStatus} - ETA {formatDate(selectedTrip.eta)}
              </p>
            </div>
          ) : <p className="mt-4 text-sm text-slate-600">Sin viajes.</p>}
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Solicitudes de cliente</h2>
          <div className="mt-4 grid gap-3">
            {requests.length ? requests.map((request) => (
              <div className="rounded-lg border border-slate-200 p-3" data-testid={`request-card-${request.id}`} key={request.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{request.reference}</p>
                    <p className="text-sm text-slate-600">{request.customerAccount.name} - {request.origin} a {request.destination}</p>
                  </div>
                  <Badge tone="blue">{request.status}</Badge>
                </div>
                <form action={confirmRequestAsTripAction.bind(null, tenantSlug)} className="mt-3">
                  <input name="requestId" type="hidden" value={request.id} />
                  <SubmitButton>Confirmar y convertir</SubmitButton>
                </form>
              </div>
            )) : <p className="text-sm text-slate-600">No hay solicitudes pendientes.</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">Servicios operativos</h2>
        <div className="mt-4 grid gap-4">
          {trips.map((trip) => {
            const next = nextStatuses(trip.status, membership.role);
            return (
              <div className="grid gap-4 rounded-lg border border-slate-200 p-4 lg:grid-cols-[1fr_0.9fr]" data-testid={`trip-card-${trip.id}`} key={trip.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{trip.reference}</p>
                    <Badge tone={trip.status === "CLOSED" ? "green" : trip.status === "IN_TRANSIT" ? "orange" : "blue"}>{trip.status}</Badge>
                    <span className="text-sm text-slate-500">{trip.customerAccount.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{trip.origin} {" -> "} {trip.destination}</p>
                  <p className="text-sm text-slate-600">Conductor: {trip.driver?.name ?? "Sin asignar"} | Vehiculo: {trip.vehicle?.code ?? "Sin unidad"}</p>
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    {trip.events.map((event) => <p key={event.id}>{formatDate(event.createdAt)} - {event.toStatus} - {event.note}</p>)}
                  </div>
                </div>
                <div className="grid gap-3">
                  <form action={assignTripAction.bind(null, tenantSlug)} className="grid gap-2 rounded-md bg-slate-50 p-3">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <input name="scheduledAt" type="hidden" value={trip.scheduledAt.toISOString().slice(0, 16)} />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select className="rounded-md border border-slate-300 px-2 py-2" name="vehicleId" defaultValue={trip.vehicleId ?? ""}>
                        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code}</option>)}
                      </select>
                      <select className="rounded-md border border-slate-300 px-2 py-2" name="equipmentId" defaultValue={trip.equipmentId ?? ""}>
                        {equipment.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
                      </select>
                      <select className="rounded-md border border-slate-300 px-2 py-2" name="driverId" defaultValue={trip.driverId ?? ""}>
                        {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.code}</option>)}
                      </select>
                    </div>
                    <input className="rounded-md border border-slate-300 px-2 py-2 text-sm" name="notes" placeholder="Notas de asignacion" />
                    <SubmitButton>Asignar</SubmitButton>
                  </form>
                  <form action={transitionTripAction.bind(null, tenantSlug)} className="flex flex-wrap gap-2">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <input name="note" type="hidden" value="Avance registrado desde centro de control." />
                    <select className="rounded-md border border-slate-300 px-3 py-2" name="nextStatus">
                      {next.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <SubmitButton>Avanzar</SubmitButton>
                  </form>
                  <form action={reportIncidentAction.bind(null, tenantSlug)} className="grid gap-2">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <input name="category" type="hidden" value="Retraso" />
                    <TextArea label="Incidencia visible al cliente" name="customerMessage" />
                    <SubmitButton className="bg-orange-600 hover:bg-orange-700">Registrar incidencia</SubmitButton>
                  </form>
                  {trip.proof ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-900">Evidencia: {trip.proof.status}</p>
                      <p className="text-xs text-emerald-800">Receptor: {trip.proof.receiverName}</p>
                      <div className="mt-2 grid gap-1">
                        {trip.documents.filter((document) => document.proofId === trip.proof?.id).map((document) => (
                          <span className="text-xs text-slate-700" key={document.id}>{document.filename}</span>
                        ))}
                      </div>
                      {trip.proof.status === "SUBMITTED" ? (
                        <form action={approveProofAction.bind(null, tenantSlug)} className="mt-3">
                          <input name="tripId" type="hidden" value={trip.id} />
                          <SubmitButton className="bg-emerald-700 hover:bg-emerald-800">Aprobar evidencia y generar POD</SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}
