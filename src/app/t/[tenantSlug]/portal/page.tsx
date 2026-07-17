import {
  CalendarClock,
  CheckCircle2,
  Container,
  FileText,
  Home,
  Inbox,
  MapPin,
  PackageOpen,
  Phone,
  PlusCircle,
  Route,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNavGroup } from "@/components/shell/shell-chrome";
import { TripMap } from "@/components/trip-map";
import {
  Card,
  CardHeader,
  DocumentCard,
  EmptyState,
  Field,
  MetricCard,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
  TenantBrandingProvider,
  TextArea,
  Timeline,
  TimelineItem,
} from "@/components/ui";
import { createServiceRequestAction } from "@/lib/server/actions";
import { customerNextStep } from "@/lib/domain/state-machine";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import {
  customerRoleLabel,
  incidentStatusLabel,
  incidentStatusTone,
  requestStatusLabel,
  requestStatusTone,
  tripStatusTone,
} from "@/lib/ui/status";
import { formatDate, formatDateShort } from "@/lib/utils";

function documentLabel(filename: string) {
  if (filename.endsWith("-pod.pdf")) {
    return `Prueba de entrega ${filename.replace(/-pod\.pdf$/, "")}`;
  }
  if (filename.startsWith("evidence-")) {
    return "Evidencia de entrega";
  }
  return filename;
}

export default async function CustomerPortalPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { tenant, customerAccount, membership } = await requireCustomerMembership(tenantSlug);
  const db = getDb();
  const [serviceTypes, requests, trips, incidents, documents, activeCount, completedCount] = await Promise.all([
    db.serviceType.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } }),
    db.serviceRequest.findMany({
      where: { tenantId: tenant.id, customerAccountId: customerAccount.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
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
      take: 9,
    }),
    db.trip.count({
      where: { tenantId: tenant.id, customerAccountId: customerAccount.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
    }),
    db.trip.count({ where: { tenantId: tenant.id, customerAccountId: customerAccount.id, status: "CLOSED" } }),
  ]);
  const activeTrip = trips.find((trip) => !["CLOSED", "CANCELLED"].includes(trip.status)) ?? trips[0];
  const basePath = `/t/${tenantSlug}/portal`;

  const navGroups: ShellNavGroup[] = [
    {
      items: [{ label: "Inicio", href: basePath, icon: <Home />, exact: true }],
    },
    {
      title: "Servicios",
      items: [
        { label: "Solicitar servicio", href: `${basePath}#solicitar`, icon: <PlusCircle /> },
        { label: "Mis servicios", href: `${basePath}#servicios`, icon: <Route /> },
        { label: "Incidencias", href: `${basePath}#incidencias`, icon: <TriangleAlert /> },
        { label: "Documentos", href: `${basePath}#documentos`, icon: <FileText /> },
      ],
    },
  ];

  return (
    <TenantBrandingProvider branding={tenant.branding}>
      <AppShell
        brandContext="Portal de servicios"
        brandName={tenant.name}
        navGroups={navGroups}
        user={{ name: customerAccount.name, role: customerRoleLabel[membership.role] }}
      >
        <div className="anim-page grid gap-6">
          <PageHeader
            breadcrumbs={[{ label: tenant.name }, { label: "Portal cliente" }]}
            description="Consulte sus servicios, solicite transporte y descargue sus documentos."
            title={`${tenant.name} - Portal Cliente`}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard hint="En ejecucion o programados" href="#servicios" icon={<Route />} label="Servicios activos" tone="primary" value={activeCount} />
            <MetricCard hint="Entregados y cerrados" icon={<CheckCircle2 />} label="Servicios completados" tone="success" value={completedCount} />
            <MetricCard
              hint={incidents.length > 0 ? "Comunicadas por su transportista" : "Sin novedades reportadas"}
              href="#incidencias"
              icon={<TriangleAlert />}
              label="Incidencias"
              tone={incidents.length > 0 ? "warning" : "default"}
              value={incidents.length}
            />
            <MetricCard hint="PODs y evidencias disponibles" href="#documentos" icon={<FileText />} label="Documentos" value={documents.length} />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="scroll-mt-20" id="solicitar">
              <CardHeader
                description="Complete los datos y su transportista confirmara el servicio."
                icon={<PlusCircle />}
                title="Nueva solicitud de transporte"
              />
              <form action={createServiceRequestAction.bind(null, tenantSlug)} className="mt-4 grid gap-5">
                <input name="intent" type="hidden" value="REQUESTED" />

                <fieldset className="grid gap-3.5 rounded-lg border border-border p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-foreground">
                    <MapPin aria-hidden className="size-4 text-primary" />
                    Ruta y programacion
                  </legend>
                  <SelectField label="Tipo de servicio" name="serviceTypeId">
                    {serviceTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </SelectField>
                  <Field defaultValue="Manzanillo International Terminal" label="Origen" name="origin" />
                  <Field defaultValue="Puerto de Balboa" label="Destino" name="destination" />
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="Fecha requerida" name="requestedDate" type="datetime-local" />
                    <SelectField label="Prioridad" name="priority">
                      <option value="NORMAL">Normal</option>
                      <option value="URGENT">Urgente</option>
                    </SelectField>
                  </div>
                </fieldset>

                <fieldset className="grid gap-3.5 rounded-lg border border-border p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-foreground">
                    <Container aria-hidden className="size-4 text-primary" />
                    Datos del contenedor
                  </legend>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field defaultValue="NCIU7654321" label="Numero de contenedor" name="containerNumber" />
                    <Field defaultValue="40HC" label="Tamano" name="containerSize" />
                    <Field defaultValue="Dry" label="Tipo de contenedor" name="containerType" />
                    <Field defaultValue="Naviera Demo" label="Naviera" name="shippingLine" />
                    <Field defaultValue="MIT" label="Terminal" name="terminal" />
                    <Field defaultValue="SELLO-123" label="Numero de sello" name="sealNumber" />
                    <SelectField label="Estado de carga" name="loadStatus">
                      <option value="LOADED">Cargado</option>
                      <option value="EMPTY">Vacio</option>
                    </SelectField>
                    <SelectField label="Retorno de vacio" name="emptyReturnRequired">
                      <option value="YES">Si</option>
                      <option value="NO">No</option>
                    </SelectField>
                  </div>
                  <Field defaultValue="BOOK-DEMO-001" help="Referencia de booking de su naviera o interna." label="Booking o referencia" name="bookingReference" />
                </fieldset>

                <fieldset className="grid gap-3.5 rounded-lg border border-border p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-foreground">
                    <Phone aria-hidden className="size-4 text-primary" />
                    Contacto e instrucciones
                  </legend>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field defaultValue="Coordinador Demo" label="Contacto" name="contactName" />
                    <Field defaultValue="+50760000000" label="Telefono contacto" name="contactPhone" />
                  </div>
                  <TextArea help="Estas instrucciones seran visibles para el equipo operativo." label="Instrucciones visibles" name="customerNotes" />
                </fieldset>

                <SubmitButton size="lg">Crear solicitud</SubmitButton>
              </form>
            </Card>

            <div className="grid min-w-0 content-start gap-6">
              <Card>
                <CardHeader
                  description={activeTrip ? `Servicio ${activeTrip.reference}` : "Sin servicios en curso"}
                  icon={<MapPin />}
                  title="Avance autorizado"
                />
                {activeTrip ? (
                  <div className="anim-scale-in mt-4 grid gap-3">
                    <TripMap
                      expectedDuration={activeTrip.expectedDuration}
                      routePoints={activeTrip.routePoints}
                      simulationPausedAt={activeTrip.simulationPausedAt}
                      simulationProgress={activeTrip.simulationProgress}
                      simulationStartedAt={activeTrip.simulationStartedAt}
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p className="font-mono text-sm font-bold text-foreground">{activeTrip.reference}</p>
                      <StatusBadge label={activeTrip.customerVisibleStatus} tone={tripStatusTone[activeTrip.status]} />
                      <span className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                        <CalendarClock aria-hidden className="size-3.5" />
                        ETA {formatDate(activeTrip.eta)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-surface-sunken/70 px-3 py-2.5 text-sm">
                      <Route aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Qué sigue: </span>
                        <span className="text-muted-foreground">{customerNextStep[activeTrip.status]}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    className="mt-4"
                    description="Cree una solicitud de transporte para iniciar su primer servicio."
                    icon={<PackageOpen />}
                    title="Aun no hay viajes para este cliente"
                  />
                )}
              </Card>

              <Card>
                <CardHeader description="Estado de sus solicitudes enviadas." icon={<Inbox />} title="Solicitudes recientes" />
                <div className="mt-4 grid gap-2.5">
                  {requests.length ? (
                    requests.map((request, index) => (
                      <div
                        className="anim-item flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                        key={request.id}
                        style={{ "--stagger": index } as React.CSSProperties}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold text-foreground">{request.reference}</p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {request.origin} → {request.destination}
                          </p>
                        </div>
                        <StatusBadge label={requestStatusLabel[request.status]} tone={requestStatusTone[request.status]} />
                      </div>
                    ))
                  ) : (
                    <EmptyState compact description="Cree su primera solicitud desde este portal." icon={<Inbox />} title="Sin solicitudes" />
                  )}
                </div>
              </Card>
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="scroll-mt-20" id="servicios">
              <CardHeader description="Trazabilidad autorizada de cada servicio." icon={<Route />} title="Servicios y linea de tiempo" />
              <div className="mt-4 grid gap-4">
                {trips.length ? (
                  trips.map((trip) => (
                    <div className="rounded-lg border border-border p-4" key={trip.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-bold text-foreground">{trip.reference}</p>
                        <StatusBadge label={trip.customerVisibleStatus} tone={tripStatusTone[trip.status]} />
                        {trip.proofReady ? (
                          <a
                            className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
                            href={`/api/t/${tenantSlug}/proof/${trip.id}`}
                          >
                            <FileText aria-hidden className="size-4" />
                            Descargar POD
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {trip.origin} → {trip.destination}
                      </p>
                      {trip.events.length ? (
                        <div className="mt-3.5 border-t border-border pt-3.5">
                          <Timeline>
                            {trip.events.map((event, eventIndex) => (
                              <TimelineItem
                                isLast={eventIndex === trip.events.length - 1}
                                key={event.id}
                                meta={formatDateShort(event.createdAt)}
                                title={event.note ?? event.toStatus}
                                tone={tripStatusTone[event.toStatus]}
                              />
                            ))}
                          </Timeline>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyState
                    description="Cuando su transportista confirme una solicitud, el servicio aparecera aqui."
                    icon={<Route />}
                    title="Sin servicios registrados"
                  />
                )}
              </div>
            </Card>

            <div className="grid min-w-0 content-start gap-6">
              <Card className="scroll-mt-20" id="incidencias">
                <CardHeader description="Novedades comunicadas por su transportista." icon={<TriangleAlert />} title="Incidencias comunicadas" />
                <div className="mt-4 grid gap-2.5">
                  {incidents.length ? (
                    incidents.map((incident) => (
                      <div className="rounded-lg border border-warning/25 bg-warning-soft/40 p-3.5" key={incident.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{incident.category}</p>
                          <StatusBadge label={incidentStatusLabel[incident.status]} tone={incidentStatusTone[incident.status]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{incident.customerMessage}</p>
                        <p className="mt-1.5 text-xs tabular-nums text-faint-foreground">{formatDateShort(incident.createdAt)}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState compact description="Su operacion no registra novedades." icon={<CheckCircle2 />} title="Sin incidencias visibles" />
                  )}
                </div>
              </Card>

              <Card className="scroll-mt-20" id="documentos">
                <CardHeader description="Pruebas de entrega y evidencias autorizadas." icon={<FileText />} title="Documentos autorizados" />
                <div className="mt-4 grid gap-2.5">
                  {documents.length ? (
                    documents.map((document) => (
                      <DocumentCard
                        createdAt={document.createdAt}
                        filename={document.filename}
                        href={`/api/t/${tenantSlug}/documents/${document.id}`}
                        key={document.id}
                        label={documentLabel(document.filename)}
                        mimeType={document.mimeType}
                      />
                    ))
                  ) : (
                    <EmptyState
                      compact
                      description="Los documentos de sus servicios cerrados apareceran aqui."
                      icon={<FileText />}
                      title="Sin documentos autorizados"
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-xs text-faint-foreground">
            <p>{tenant.branding?.footerText ?? "Tecnologia desarrollada por NCI Automation"}</p>
            {tenant.branding?.supportMail ? (
              <p>
                Soporte: <span className="font-mono">{tenant.branding.supportMail}</span>
              </p>
            ) : null}
          </footer>
        </div>
      </AppShell>
    </TenantBrandingProvider>
  );
}
