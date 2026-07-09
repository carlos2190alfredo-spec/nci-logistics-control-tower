import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TripMap } from "@/components/trip-map";
import { Badge, Card, Field, SubmitButton, TextArea } from "@/components/ui";
import { createServiceRequestAction } from "@/lib/server/actions";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { formatDate } from "@/lib/utils";

export default async function CustomerPortalPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { tenant, customerAccount, membership } = await requireCustomerMembership(tenantSlug);
  const db = getDb();
  const [serviceTypes, requests, trips, incidents, documents] = await Promise.all([
    db.serviceType.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } }),
    db.serviceRequest.findMany({ where: { tenantId: tenant.id, customerAccountId: customerAccount.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.trip.findMany({
      where: { tenantId: tenant.id, customerAccountId: customerAccount.id },
      include: { events: { where: { visibleToCustomer: true }, orderBy: { createdAt: "desc" }, take: 8 }, proof: true },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
    db.incident.findMany({
      where: { tenantId: tenant.id, customerAccountId: customerAccount.id, visibleToCustomer: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.document.findMany({
      where: { tenantId: tenant.id, customerAccountId: customerAccount.id, visibility: "CUSTOMER_VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const activeTrip = trips.find((trip) => !["CLOSED", "CANCELLED"].includes(trip.status)) ?? trips[0];

  return (
    <AppShell
      title={`${tenant.name} - Portal Cliente`}
      subtitle={`${customerAccount.name} - ${membership.role}`}
      nav={<Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}`}>Centro de control</Link>}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Solicitudes</p><p className="mt-2 text-3xl font-bold">{requests.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Servicios</p><p className="mt-2 text-3xl font-bold">{trips.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Incidencias visibles</p><p className="mt-2 text-3xl font-bold">{incidents.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Documentos</p><p className="mt-2 text-3xl font-bold">{documents.length}</p></Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-lg font-bold">Nueva solicitud de transporte</h2>
          <form action={createServiceRequestAction.bind(null, tenantSlug)} className="mt-4 grid gap-3">
            <input name="intent" type="hidden" value="REQUESTED" />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tipo de servicio
              <select className="min-h-10 rounded-md border border-slate-300 px-3" name="serviceTypeId">
                {serviceTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <Field label="Origen" name="origin" defaultValue="Manzanillo International Terminal" />
            <Field label="Destino" name="destination" defaultValue="Puerto de Balboa" />
            <Field label="Fecha requerida" name="requestedDate" type="datetime-local" />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioridad
              <select className="min-h-10 rounded-md border border-slate-300 px-3" name="priority">
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgente</option>
              </select>
            </label>
            <Field label="Contacto" name="contactName" defaultValue="Coordinador Demo" />
            <Field label="Telefono contacto" name="contactPhone" defaultValue="+50760000000" />
            <Field label="Numero de contenedor" name="containerNumber" defaultValue="NCIU7654321" />
            <Field label="Tamano" name="containerSize" defaultValue="40HC" />
            <Field label="Tipo de contenedor" name="containerType" defaultValue="Dry" />
            <Field label="Naviera" name="shippingLine" defaultValue="Naviera Demo" />
            <Field label="Terminal" name="terminal" defaultValue="MIT" />
            <Field label="Numero de sello" name="sealNumber" defaultValue="SELLO-123" />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Estado de carga
              <select className="min-h-10 rounded-md border border-slate-300 px-3" name="loadStatus">
                <option value="LOADED">Cargado</option>
                <option value="EMPTY">Vacio</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Retorno de vacio
              <select className="min-h-10 rounded-md border border-slate-300 px-3" name="emptyReturnRequired">
                <option value="YES">Si</option>
                <option value="NO">No</option>
              </select>
            </label>
            <Field label="Booking o referencia" name="bookingReference" defaultValue="BOOK-DEMO-001" />
            <TextArea label="Instrucciones visibles" name="customerNotes" />
            <SubmitButton>Crear solicitud</SubmitButton>
          </form>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Avance autorizado</h2>
          {activeTrip ? (
            <div className="mt-4 grid gap-4">
              <TripMap
                routePoints={activeTrip.routePoints}
                simulationStartedAt={activeTrip.simulationStartedAt}
                simulationPausedAt={activeTrip.simulationPausedAt}
                simulationProgress={activeTrip.simulationProgress}
                expectedDuration={activeTrip.expectedDuration}
              />
              <div>
                <p className="font-semibold">{activeTrip.reference}</p>
                <p className="text-sm text-slate-600">{activeTrip.customerVisibleStatus} - ETA {formatDate(activeTrip.eta)}</p>
              </div>
            </div>
          ) : <p className="mt-4 text-sm text-slate-600">Aun no hay viajes para este cliente.</p>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Solicitudes recientes</h2>
          <div className="mt-4 grid gap-3">
            {requests.length ? requests.map((request) => (
              <div className="rounded-lg border border-slate-200 p-3" key={request.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{request.reference}</p>
                  <Badge tone={request.status === "CONVERTED" ? "green" : "blue"}>{request.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{request.origin} {" -> "} {request.destination}</p>
              </div>
            )) : <p className="text-sm text-slate-600">Sin solicitudes.</p>}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Servicios y linea de tiempo</h2>
          <div className="mt-4 grid gap-3">
            {trips.map((trip) => (
              <div className="rounded-lg border border-slate-200 p-3" key={trip.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{trip.reference}</p>
                  <Badge tone={trip.status === "CLOSED" ? "green" : "blue"}>{trip.customerVisibleStatus}</Badge>
                  {trip.proofReady ? <a className="font-semibold text-blue-700" href={`/api/t/${tenantSlug}/proof/${trip.id}`}>Descargar POD</a> : null}
                </div>
                <p className="mt-1 text-sm text-slate-600">{trip.origin} {" -> "} {trip.destination}</p>
                <div className="mt-3 grid gap-1 text-xs text-slate-500">
                  {trip.events.map((event) => <p key={event.id}>{formatDate(event.createdAt)} - {event.note ?? event.toStatus}</p>)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Incidencias comunicadas</h2>
          <div className="mt-4 grid gap-3">
            {incidents.length ? incidents.map((incident) => (
              <div className="rounded-lg border border-slate-200 p-3" key={incident.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{incident.category}</p>
                  <Badge tone="orange">{incident.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{incident.customerMessage}</p>
              </div>
            )) : <p className="text-sm text-slate-600">Sin incidencias visibles.</p>}
          </div>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="text-lg font-bold">Documentos autorizados</h2>
        <div className="mt-4 grid gap-2">
          {documents.length ? documents.map((document) => (
            <a className="rounded-md border border-slate-200 p-3 text-sm font-semibold text-blue-700" href={`/api/t/${tenantSlug}/documents/${document.id}`} key={document.id}>
              {document.filename}
            </a>
          )) : <p className="text-sm text-slate-600">Sin documentos autorizados.</p>}
        </div>
      </Card>
    </AppShell>
  );
}
