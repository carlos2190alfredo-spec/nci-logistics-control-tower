import Link from "next/link";
import { ArrowRight, Ban, Brain, CircleAlert, ClipboardCheck, FileCheck2, MapPin, Route, TriangleAlert, Truck, User } from "lucide-react";
import type { Prisma, TenantRole, TripStatus } from "@/generated/prisma";
import { ASSIGNABLE_TRIP_STATUSES, exceptionStatuses, nextStatuses } from "@/lib/domain/state-machine";
import {
  approveProofAction,
  assignTripAction,
  rejectProofAction,
  reportIncidentAction,
  transitionTripAction,
} from "@/lib/server/actions";
import { calculateRouteEstimateAction } from "@/lib/server/route-actions";
import { generateDriverRecommendationAction } from "@/lib/server/driver-recommendation-actions";
import { proofStatusLabel, proofStatusTone, tripStatusLabel, tripStatusTone } from "@/lib/ui/status";
import { formatDate, formatDateShort } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { Collapsible } from "@/components/ui/collapsible";
import { SelectField, TextArea } from "@/components/ui/field";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { OperationsIncidentForm } from "@/components/tenant/operations-incident-form";
import {
  complianceLightLabel,
  complianceLightTone,
  type ComplianceLight,
} from "@/lib/ui/compliance";

export type OperationsTrip = Prisma.TripGetPayload<{
  include: {
    customerAccount: true;
    driver: true;
    vehicle: true;
    equipment: true;
    proof: true;
    documents: true;
    events: true;
    stops: true;
    routeEstimates: true;
    driverRecommendations: true;
  };
}>;

type Resource = { id: string; code: string };

/** Verbo de la accion de excepcion, en vez del nombre del estado destino. */
const exceptionActionLabel: Partial<Record<TripStatus, string>> = {
  CANCELLED: "Cancelar servicio",
  DELIVERY_FAILED: "Registrar entrega fallida",
  IN_TRANSIT: "Reintentar entrega o retornar carga",
};

/**
 * Tarjeta operativa de viaje para el centro de control.
 * Solo muestra las acciones validas para el estado actual y el rol.
 */
export function TripOperationsCard({
  trip,
  tenantSlug,
  role,
  vehicles,
  equipment,
  drivers,
  index = 0,
  eligibilityLight,
  blockedAssets,
}: {
  trip: OperationsTrip;
  tenantSlug: string;
  role: TenantRole;
  vehicles: Resource[];
  equipment: Resource[];
  drivers: Resource[];
  /**
   * Set de activos bloqueados por mantenimiento con formato
   * `VEHICULO:CODIGO` o `EQUIPO:CODIGO`. Sus opciones se marcan como
   * deshabilitadas en el select de asignación.
   */
  blockedAssets?: Set<string>;
  index?: number;
  eligibilityLight?: ComplianceLight;
}) {
  const next = nextStatuses(trip.status, role);
  const exceptions = exceptionStatuses(trip.status, role);
  const canAssign = ASSIGNABLE_TRIP_STATUSES.includes(trip.status);
  const proofDocuments = trip.documents.filter((document) => document.proofId === trip.proof?.id);

  return (
    <article
      className="anim-item grid gap-5 rounded-xl border border-border bg-surface p-5 shadow-xs lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
      data-testid={`trip-card-${trip.id}`}
      style={{ "--stagger": index } as React.CSSProperties}
    >
      {/* Resumen del servicio */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-sm font-bold tracking-tight text-foreground">{trip.reference}</h3>
          <StatusBadge label={tripStatusLabel[trip.status]} tone={tripStatusTone[trip.status]} />
          {eligibilityLight && eligibilityLight !== "VERDE" ? (
            <Link
              className="inline-flex"
              href={`/t/${tenantSlug}/compliance`}
              title="Ver cumplimiento"
            >
              <StatusBadge
                label={`Cumplimiento: ${complianceLightLabel[eligibilityLight]}`}
                tone={complianceLightTone[eligibilityLight]}
              />
            </Link>
          ) : null}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <User aria-hidden className="size-3.5 shrink-0" />
          {trip.customerAccount.name}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-sunken/70 px-3 py-2.5 text-sm font-medium text-foreground">
          <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words">{trip.origin}</span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-faint-foreground" />
          <span className="min-w-0 break-words">{trip.destination}</span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Programado</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatDate(trip.scheduledAt)}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Conductor</dt>
            <dd className="font-medium text-foreground">{trip.driver?.name ?? "Sin asignar"}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Vehiculo</dt>
            <dd className="font-medium text-foreground">{trip.vehicle?.code ?? "Sin unidad"}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-muted-foreground">Equipo</dt>
            <dd className="font-medium text-foreground">{trip.equipment?.code ?? "Sin equipo"}</dd>
          </div>
        </dl>
        {trip.events.length ? (
          <div className="mt-4 border-t border-border pt-3.5">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-faint-foreground">Ultimos hitos</p>
            <Timeline>
              {trip.events.map((event, eventIndex) => (
                <TimelineItem
                  isLast={eventIndex === trip.events.length - 1}
                  key={event.id}
                  meta={event.reason ? `${formatDateShort(event.createdAt)} · Motivo: ${event.reason}` : formatDateShort(event.createdAt)}
                  title={tripStatusLabel[event.toStatus]}
                  tone={tripStatusTone[event.toStatus]}
                />
              ))}
            </Timeline>
          </div>
        ) : null}
      </div>

      {/* Acciones permitidas segun estado */}
      <div className="grid content-start gap-3">
        {canAssign ? (
          <ActionForm
            action={assignTripAction.bind(null, tenantSlug)}
            className="grid gap-2.5 rounded-lg border border-border bg-surface-sunken/60 p-3.5"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Truck aria-hidden className="size-3.5" />
              Asignacion de recursos
            </p>
            <input name="tripId" type="hidden" value={trip.id} />
            <input name="scheduledAt" type="hidden" value={trip.scheduledAt.toISOString().slice(0, 16)} />
            <div className="grid gap-2.5 sm:grid-cols-3">
              <SelectField defaultValue={trip.vehicleId ?? ""} label="Vehiculo" name="vehicleId">
                {vehicles.map((vehicle) => {
                  const isBlocked = blockedAssets?.has(`VEHICULO:${vehicle.code}`) ?? false;
                  return (
                    <option disabled={isBlocked} key={vehicle.id} value={vehicle.id}>
                      {vehicle.code}
                      {isBlocked ? " · en mantenimiento" : ""}
                    </option>
                  );
                })}
              </SelectField>
              <SelectField defaultValue={trip.equipmentId ?? ""} label="Equipo" name="equipmentId">
                {equipment.map((item) => {
                  const isBlocked = blockedAssets?.has(`EQUIPO:${item.code}`) ?? false;
                  return (
                    <option disabled={isBlocked} key={item.id} value={item.id}>
                      {item.code}
                      {isBlocked ? " · en mantenimiento" : ""}
                    </option>
                  );
                })}
              </SelectField>
              <SelectField defaultValue={trip.driverId ?? ""} label="Conductor" name="driverId">
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.code}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextArea label="Notas de asignacion" name="notes" rows={1} />
            <SubmitButton>Asignar</SubmitButton>
          </ActionForm>
        ) : null}

        {next.length ? (
          <ActionForm
            action={transitionTripAction.bind(null, tenantSlug)}
            className="grid gap-2.5 rounded-lg border border-border bg-surface-sunken/60 p-3.5"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardCheck aria-hidden className="size-3.5" />
              Avance de estado
            </p>
            <input name="tripId" type="hidden" value={trip.id} />
            <input name="note" type="hidden" value="Avance registrado desde centro de control." />
            <div className="flex flex-wrap items-end gap-2.5">
              <SelectField className="min-w-44 flex-1" label="Siguiente estado" name="nextStatus">
                {next.map((status) => (
                  <option key={status} value={status}>
                    {tripStatusLabel[status]}
                  </option>
                ))}
              </SelectField>
              <SubmitButton variant="secondary">Avanzar</SubmitButton>
            </div>
          </ActionForm>
        ) : null}

        {exceptions.length ? (
          <Collapsible icon={<Ban />} summary="Cancelar o registrar excepcion" tone="warning">
            <ActionForm action={transitionTripAction.bind(null, tenantSlug)} className="grid gap-2.5">
              <input name="tripId" type="hidden" value={trip.id} />
              <SelectField label="Accion de excepcion" name="nextStatus">
                {exceptions.map((status) => (
                  <option key={status} value={status}>
                    {exceptionActionLabel[status] ?? tripStatusLabel[status]}
                  </option>
                ))}
              </SelectField>
              <TextArea
                help="Obligatorio. Queda en la auditoria interna; el cliente solo ve el nuevo estado."
                label="Motivo"
                name="reason"
                required
                rows={2}
              />
              <SubmitButton variant="danger">Aplicar excepcion</SubmitButton>
            </ActionForm>
          </Collapsible>
        ) : null}

        {/* Estimacion de ruta */}
        <Collapsible icon={<Route />} summary="Estimacion de ruta">
          {trip.routeEstimates && trip.routeEstimates.length > 0 ? (
            <div className="grid gap-2 text-sm">
              {(() => {
                const latest = trip.routeEstimates[trip.routeEstimates.length - 1];
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Estado</span>
                      <StatusBadge
                        label={latest.status === "ESTIMATED" ? "Estimado" : latest.status === "FAILED" ? "Error" : "No solicitado"}
                        tone={latest.status === "ESTIMATED" ? "success" : latest.status === "FAILED" ? "danger" : "neutral"}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Proveedor</span>
                      <span className="font-medium text-foreground">{latest.provider}</span>
                    </div>
                    {latest.distanceMeters != null ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Distancia</span>
                        <span className="font-mono font-medium text-foreground">
                          {(latest.distanceMeters / 1000).toFixed(1)} km
                        </span>
                      </div>
                    ) : null}
                    {latest.durationSeconds != null ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Duracion estimada</span>
                        <span className="font-mono font-medium text-foreground">
                          {Math.ceil(latest.durationSeconds / 60)} min
                        </span>
                      </div>
                    ) : null}
                    {latest.trafficDurationSeconds != null ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Con trafico</span>
                        <span className="font-mono font-medium text-foreground">
                          {Math.ceil(latest.trafficDurationSeconds / 60)} min
                        </span>
                      </div>
                    ) : null}
                    {latest.routeSummary ? (
                      <p className="mt-1 text-xs text-faint-foreground">{latest.routeSummary}</p>
                    ) : null}
                    {latest.safeErrorMessage ? (
                      <p className="mt-1 text-xs text-danger-strong">{latest.safeErrorMessage}</p>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin estimacion de ruta. Agregue paradas con coordenadas para calcular.</p>
          )}
          {trip.stops && trip.stops.length >= 2 ? (
            <form action={calculateRouteEstimateAction} className="mt-3">
              <input name="tenantSlug" type="hidden" value={tenantSlug} />
              <input name="tripId" type="hidden" value={trip.id} />
              <SubmitButton variant="secondary">
                {trip.routeEstimates && trip.routeEstimates.length > 0 ? "Recalcular ruta" : "Calcular estimacion"}
              </SubmitButton>
            </form>
          ) : null}
        </Collapsible>

        {/* Recomendacion de conductor */}
        <Collapsible icon={<Brain />} summary="Recomendacion de conductor">
          {trip.driverRecommendations && trip.driverRecommendations.length > 0 ? (
            <div className="grid gap-2 text-sm">
              {trip.driverRecommendations
                .filter((r) => r.rank === 1)
                .map((rec) => (
                  <div key={rec.id} className="rounded-lg border border-border bg-surface-sunken/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{rec.recommendationTitle}</span>
                      <StatusBadge
                        label={rec.riskLevel === "LOW" ? "Bajo" : rec.riskLevel === "MEDIUM" ? "Medio" : "Alto"}
                        tone={rec.riskLevel === "LOW" ? "success" : rec.riskLevel === "MEDIUM" ? "warning" : "danger"}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{rec.explanation}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-faint-foreground">
                      <span className="font-mono">Score: {rec.score}</span>
                      <StatusBadge
                        label={
                          rec.status === "GENERATED" ? "Pendiente"
                            : rec.status === "ACCEPTED" ? "Aceptada"
                            : rec.status === "OVERRIDDEN" ? "Anulada"
                            : "Descartada"
                        }
                        tone={rec.status === "ACCEPTED" ? "success" : rec.status === "OVERRIDDEN" ? "warning" : "info"}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Genere una recomendacion para asistir en la asignacion de conductor.</p>
          )}
          <form action={generateDriverRecommendationAction} className="mt-3">
            <input name="tenantSlug" type="hidden" value={tenantSlug} />
            <input name="tripId" type="hidden" value={trip.id} />
            <SubmitButton variant="secondary">Generar recomendacion</SubmitButton>
          </form>
        </Collapsible>

        <Collapsible icon={<TriangleAlert />} summary="Registrar incidencia" tone="warning">
          <OperationsIncidentForm action={reportIncidentAction.bind(null, tenantSlug)} tripId={trip.id} />
        </Collapsible>

        {trip.proof ? (
          <div className="grid gap-2.5 rounded-lg border border-success/30 bg-success-soft/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success-strong">
                <FileCheck2 aria-hidden className="size-4" />
                Evidencia de entrega
              </p>
              <StatusBadge label={proofStatusLabel[trip.proof.status]} tone={proofStatusTone[trip.proof.status]} />
            </div>
            <p className="text-sm text-success-strong">
              Receptor: <span className="font-semibold">{trip.proof.receiverName}</span>
            </p>
            {trip.proof.status === "REJECTED" && trip.proof.rejectionReason ? (
              <p className="flex items-start gap-1.5 text-sm text-danger-strong">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Motivo del rechazo: {trip.proof.rejectionReason}
              </p>
            ) : null}
            {proofDocuments.length ? (
              <ul className="grid gap-1 text-xs text-success-strong/90">
                {proofDocuments.map((document) => (
                  <li className="truncate font-mono" key={document.id}>
                    {document.filename}
                  </li>
                ))}
              </ul>
            ) : null}
            {trip.proof.status === "SUBMITTED" ? (
              <>
                <ActionForm action={approveProofAction.bind(null, tenantSlug)} className="grid gap-2">
                  <input name="tripId" type="hidden" value={trip.id} />
                  <SubmitButton className="w-full" variant="success">
                    Aprobar evidencia y generar POD
                  </SubmitButton>
                </ActionForm>
                <Collapsible icon={<CircleAlert />} summary="Rechazar evidencia">
                  <ActionForm action={rejectProofAction.bind(null, tenantSlug)} className="grid gap-2.5">
                    <input name="tripId" type="hidden" value={trip.id} />
                    <TextArea
                      help="El conductor debera volver a capturar la evidencia."
                      label="Motivo del rechazo"
                      name="reason"
                      required
                    />
                    <SubmitButton variant="danger">Rechazar evidencia</SubmitButton>
                  </ActionForm>
                </Collapsible>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
