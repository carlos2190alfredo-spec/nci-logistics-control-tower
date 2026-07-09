import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, CircleAlert, MapPin, PackageCheck, Truck, TriangleAlert } from "lucide-react";
import { DriverShell } from "@/components/shell/driver-shell";
import { SignaturePad } from "@/components/signature-pad";
import {
  Alert,
  Card,
  Collapsible,
  EmptyState,
  Field,
  SelectField,
  StatusBadge,
  SubmitButton,
  TextArea,
} from "@/components/ui";
import { reportIncidentAction, submitProofAction, transitionTripAction } from "@/lib/server/actions";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { nextStatuses } from "@/lib/domain/state-machine";
import { tripStatusLabel, tripStatusTone } from "@/lib/ui/status";
import { formatDate } from "@/lib/utils";

const evidenceStatuses = ["DELIVERY_IN_PROGRESS", "DELIVERED", "EVIDENCE_PENDING", "EVIDENCE_SUBMITTED"];

export default async function DriverPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const { tenant, user, membership } = await requireTenantRole(tenantSlug, ["DRIVER", "TENANT_OWNER", "DISPATCHER"]);
  const db = getDb();
  const driver = await db.driver.findFirst({ where: { tenantId: tenant.id, userId: user.id } });
  const trips = await db.trip.findMany({
    where: {
      tenantId: tenant.id,
      driverId: membership.role === "DRIVER" ? driver?.id : undefined,
      status: { notIn: ["CLOSED", "CANCELLED"] },
    },
    include: {
      vehicle: true,
      equipment: true,
      customerAccount: true,
      proof: true,
      events: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <DriverShell
      tenantName={tenant.name}
      title={`${tenant.name} - App Conductor`}
      topNav={
        membership.role !== "DRIVER" ? (
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg border border-nav-border px-3 py-1.5 text-xs font-semibold text-nav-muted transition-colors hover:bg-nav-surface hover:text-nav-foreground"
            href={`/t/${tenantSlug}`}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Centro de control
          </Link>
        ) : undefined
      }
      user={{ name: user.name }}
    >
      <div className="anim-page grid gap-4">
        {trips.length ? (
          trips.map((trip, index) => {
            const next = nextStatuses(trip.status, membership.role);
            const showEvidence = evidenceStatuses.includes(trip.status);
            const proofRejected = trip.proof?.status === "REJECTED";
            const proofWaiting = trip.proof?.status === "SUBMITTED" && trip.status === "EVIDENCE_SUBMITTED";

            return (
              <Card
                className="anim-item p-4 sm:p-5"
                data-testid={`driver-trip-card-${trip.id}`}
                key={trip.id}
                style={{ "--stagger": index } as React.CSSProperties}
              >
                {/* Estado actual dominante */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-mono text-lg font-bold tracking-tight text-foreground">{trip.reference}</h2>
                  <StatusBadge label={tripStatusLabel[trip.status]} tone={tripStatusTone[trip.status]} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{trip.customerAccount.name}</p>

                {/* Origen y destino grandes */}
                <div className="mt-3 grid gap-2 rounded-xl bg-surface-sunken/80 p-3.5">
                  <p className="flex items-start gap-2 text-base font-semibold leading-6 text-foreground">
                    <MapPin aria-hidden className="mt-0.5 size-4.5 shrink-0 text-primary" />
                    {trip.origin}
                  </p>
                  <p className="flex items-start gap-2 text-base font-semibold leading-6 text-foreground">
                    <ArrowRight aria-hidden className="mt-0.5 size-4.5 shrink-0 text-faint-foreground" />
                    {trip.destination}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarClock aria-hidden className="size-4" />
                      {formatDate(trip.scheduledAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Truck aria-hidden className="size-4" />
                      {trip.vehicle?.code ?? "Unidad pendiente"} · {trip.equipment?.code ?? "Equipo pendiente"}
                    </span>
                  </div>
                </div>

                {/* Siguiente accion: dominante */}
                {next.length ? (
                  <form action={transitionTripAction.bind(null, tenantSlug)} className="mt-4 grid gap-3">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <input name="note" type="hidden" value="Accion registrada por conductor." />
                    <SelectField
                      label="Siguiente accion"
                      name="nextStatus"
                      selectClassName="min-h-14 text-base font-semibold"
                    >
                      {next.map((status) => (
                        <option key={status} value={status}>
                          {tripStatusLabel[status]}
                        </option>
                      ))}
                    </SelectField>
                    <SubmitButton size="lg" variant="secondary">
                      Confirmar accion
                    </SubmitButton>
                  </form>
                ) : null}

                {proofWaiting ? (
                  <Alert className="mt-4" tone="success" title="Evidencia enviada">
                    Operaciones esta revisando su evidencia. No se requiere accion adicional.
                  </Alert>
                ) : null}

                {/* Incidencia agrupada, abierta para acceso directo */}
                <Collapsible className="mt-4" defaultOpen icon={<TriangleAlert />} summary="Reportar incidencia" tone="warning">
                  <form action={reportIncidentAction.bind(null, tenantSlug)} className="grid gap-3">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <input name="category" type="hidden" value="Retraso" />
                    <TextArea label="Descripcion interna de incidencia" name="internalDescription" />
                    <TextArea help="El cliente vera este mensaje en su portal." label="Mensaje visible al cliente" name="customerMessage" />
                    <SubmitButton size="lg" variant="accent">
                      Reportar
                    </SubmitButton>
                  </form>
                </Collapsible>

                {/* Evidencia solo en estados de entrega */}
                {showEvidence ? (
                  <div className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-sunken/60 p-3.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <PackageCheck aria-hidden className="size-4.5 text-success" />
                      Evidencia de entrega
                    </p>
                    {proofRejected ? (
                      <Alert tone="danger" title="Evidencia rechazada">
                        {trip.proof?.rejectionReason ?? "Vuelva a capturar la evidencia."}
                      </Alert>
                    ) : null}
                    <form action={submitProofAction.bind(null, tenantSlug)} className="grid gap-3">
                      <input name="tripId" type="hidden" value={trip.id} />
                      <Field defaultValue="Receptor Demo" label="Nombre del receptor" name="receiverName" />
                      <TextArea label="Observacion de entrega" name="observation" />
                      <Field
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        help="Formatos: JPG, PNG, WEBP o PDF."
                        label="Fotografia o documento de evidencia"
                        name="evidenceFile"
                        type="file"
                      />
                      <SignaturePad />
                      <SubmitButton size="lg" variant="success">
                        Registrar evidencia y firma
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}

                {trip.events.length ? (
                  <details className="group mt-4">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint-foreground transition-colors hover:text-muted-foreground">
                      <CircleAlert aria-hidden className="size-3.5" />
                      Ultimas acciones registradas
                    </summary>
                    <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      {trip.events.map((event) => (
                        <li className="tabular-nums" key={event.id}>
                          {formatDate(event.createdAt)} — {tripStatusLabel[event.toStatus]}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            );
          })
        ) : (
          <EmptyState
            description="Cuando operaciones le asigne un viaje, aparecera aqui con la siguiente accion a realizar."
            icon={<Truck />}
            title="Sin viajes asignados"
          />
        )}
      </div>
    </DriverShell>
  );
}
