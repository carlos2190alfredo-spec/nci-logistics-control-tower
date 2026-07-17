import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Flame, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import {
  Card,
  CardHeader,
  PageHeader,
  SelectField,
  StatusBadge,
  SubmitButton,
} from "@/components/ui";
import { requireTenantRole } from "@/lib/server/auth";
import { getHazmatShipment, computeHazmatReadiness } from "@/lib/server/hazmat-data";
import {
  approveHazmatDispatchAction,
  refreshHazmatComplianceAction,
  transitionHazmatAction,
} from "@/lib/server/hazmat-actions";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { nextHazmatStatuses } from "@/lib/hazmat/lifecycle";
import { hazmatAllowsDispatch } from "@/lib/hazmat/readiness";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";
import { tenantRoleLabel } from "@/lib/ui/status";
import {
  hazmatClassLabel,
  hazmatComplianceLabel,
  hazmatComplianceTone,
  hazmatStatusLabel,
  hazmatStatusTone,
} from "@/lib/ui/hazmat";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HazmatDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; shipmentId: string }>;
}) {
  const { tenantSlug, shipmentId } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "SAFETY_MANAGER",
  ]);

  const shipment = await getHazmatShipment(tenant.id, shipmentId);
  if (!shipment) notFound();

  const readiness = await computeHazmatReadiness(tenant.id, shipment);
  const canManage = hasPermission(membership.role, "tenant.hazmat.manage");
  const canApprove = hasPermission(membership.role, "tenant.hazmat.approve");
  const nextStates = nextHazmatStatuses(shipment.status);

  const allRequirements = [...readiness.satisfied, ...readiness.observations, ...readiness.blockingIssues];

  return (
    <AppShell
      brandContext="Centro de control"
      brandName={tenant.name}
      navGroups={getTenantNavGroups(tenantSlug, membership.role)}
      user={{ name: user.name, role: tenantRoleLabel[membership.role] }}
    >
      <div className="anim-page grid gap-6">
        <PageHeader
          breadcrumbs={[
            { label: tenant.name, href: `/t/${tenantSlug}` },
            { label: "Combustible / Hazmat", href: `/t/${tenantSlug}/hazmat` },
            { label: shipment.reference },
          ]}
          description={`${shipment.productName} · ${hazmatClassLabel[shipment.hazardClass]}${shipment.unNumber ? ` · ${shipment.unNumber}` : ""}`}
          meta={<StatusBadge label={hazmatStatusLabel[shipment.status]} tone={hazmatStatusTone[shipment.status]} />}
          title={shipment.reference}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader description="Datos de la orden." icon={<Flame />} title="Detalle" />
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ["Propietario de carga", shipment.cargoOwner],
                  ["Punto de carga", shipment.loadPoint],
                  ["Punto de entrega", shipment.deliveryPoint],
                  ["Cantidad", shipment.quantity != null ? `${shipment.quantity} ${shipment.unit ?? ""}`.trim() : null],
                  ["Conductor", shipment.driverCode],
                  ["Cabezal", shipment.vehicleCode],
                  ["Cisterna", shipment.tankCode],
                  ["Ruta autorizada", shipment.authorizedRoute],
                  ["Horario autorizado", shipment.authorizedSchedule],
                  ["Hoja de seguridad", shipment.safetyDataSheetRef],
                  ["Plan de contingencia", shipment.contingencyPlanRef],
                  ["Aprobado", shipment.approvedAt ? formatDate(shipment.approvedAt) : null],
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-2 border-b border-border py-1.5 sm:block sm:border-0" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-foreground">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardHeader description="Requisitos verificados de forma determinista." icon={<ShieldCheck />} title="Aptitud de cumplimiento" />
                <StatusBadge label={hazmatComplianceLabel[readiness.state]} tone={hazmatComplianceTone[readiness.state]} />
              </div>
              <ul className="mt-4 grid gap-2">
                {allRequirements.map((req) => {
                  const ok = req.present && req.valid;
                  return (
                    <li className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm" key={req.key}>
                      {ok ? (
                        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      ) : (
                        <XCircle aria-hidden className={`mt-0.5 size-4 shrink-0 ${req.blocking ? "text-danger" : "text-warning"}`} />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{req.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {ok
                            ? "Cumple"
                            : !req.present
                              ? "Falta documento/dato"
                              : "Documento no vigente"}
                          {req.blocking ? " · bloquea despacho" : " · observación"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {canManage ? (
                <form action={refreshHazmatComplianceAction.bind(null, tenantSlug)} className="mt-4">
                  <input name="shipmentId" type="hidden" value={shipment.id} />
                  <button
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
                    type="submit"
                  >
                    <RefreshCw aria-hidden className="size-4" />
                    Recalcular cumplimiento
                  </button>
                </form>
              ) : null}
            </Card>
          </div>

          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <CardHeader description="Aprobación de despacho (decisión humana auditada)." icon={<ShieldCheck />} title="Aprobación" />
              <div className="mt-3">
                <StatusBadge label={hazmatComplianceLabel[readiness.state]} tone={hazmatComplianceTone[readiness.state]} />
              </div>
              {shipment.approvedAt ? (
                <p className="mt-3 text-sm text-success">Despacho aprobado {formatDate(shipment.approvedAt)}.</p>
              ) : canApprove ? (
                hazmatAllowsDispatch(readiness.state) ? (
                  <form action={approveHazmatDispatchAction.bind(null, tenantSlug)} className="mt-4">
                    <input name="shipmentId" type="hidden" value={shipment.id} />
                    <SubmitButton>Aprobar despacho</SubmitButton>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-danger">
                    No cumple los requisitos bloqueantes. Resuelva la documentación antes de aprobar.
                  </p>
                )
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Requiere rol de seguridad/administración.</p>
              )}
            </Card>

            <Card>
              <CardHeader description="Avance del ciclo de vida." icon={<ArrowRight />} title="Estado" />
              <div className="mt-4">
                <StatusBadge label={hazmatStatusLabel[shipment.status]} tone={hazmatStatusTone[shipment.status]} />
              </div>
              {canManage && nextStates.length ? (
                <form action={transitionHazmatAction.bind(null, tenantSlug)} className="mt-4 grid gap-2.5">
                  <input name="shipmentId" type="hidden" value={shipment.id} />
                  <SelectField label="Siguiente estado" name="nextStatus">
                    {nextStates.map((s) => (
                      <option key={s} value={s}>
                        {hazmatStatusLabel[s]}
                      </option>
                    ))}
                  </SelectField>
                  <SubmitButton>Avanzar estado</SubmitButton>
                </form>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {nextStates.length ? "Solo lectura para su rol." : "Expediente en estado final."}
                </p>
              )}
              {!shipment.approvedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  El despacho (unidad despachada) requiere aprobación previa.
                </p>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
