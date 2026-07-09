import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, Field, SubmitButton, TextArea } from "@/components/ui";
import { reportIncidentAction, submitProofAction, transitionTripAction } from "@/lib/server/actions";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { nextStatuses } from "@/lib/domain/state-machine";
import { formatDate } from "@/lib/utils";

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
    include: { vehicle: true, equipment: true, customerAccount: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <AppShell
      title={`${tenant.name} - App Conductor`}
      subtitle="PWA local con acciones grandes, validacion de estado y cola offline preparada"
      nav={<Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/t/${tenantSlug}`}>Centro de control</Link>}
    >
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
        Estado: online. La estructura PWA e IndexedDB queda preparada para la siguiente fase offline completa.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {trips.map((trip) => {
          const next = nextStatuses(trip.status, membership.role);
          return (
            <Card key={trip.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xl font-bold">{trip.reference}</p>
                <Badge tone="blue">{trip.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{trip.customerAccount.name}</p>
              <p className="text-sm text-slate-600">{trip.origin} {" -> "} {trip.destination}</p>
              <p className="text-sm text-slate-600">Programado: {formatDate(trip.scheduledAt)}</p>
              <p className="text-sm text-slate-600">Unidad: {trip.vehicle?.code ?? "Pendiente"} | Equipo: {trip.equipment?.code ?? "Pendiente"}</p>

              <form action={transitionTripAction.bind(null, tenantSlug)} className="mt-4 grid gap-3">
                <input name="tripId" type="hidden" value={trip.id} />
                <input name="note" type="hidden" value="Accion registrada por conductor." />
                <select className="min-h-14 rounded-md border border-slate-300 px-3 text-lg font-semibold" name="nextStatus">
                  {next.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <SubmitButton className="min-h-14 text-base">Confirmar accion</SubmitButton>
              </form>

              <form action={reportIncidentAction.bind(null, tenantSlug)} className="mt-4 grid gap-3 rounded-md bg-orange-50 p-3">
                <input name="tripId" type="hidden" value={trip.id} />
                <input name="category" type="hidden" value="Retraso" />
                <TextArea label="Reportar incidencia" name="internalDescription" />
                <SubmitButton className="min-h-14 bg-orange-600 text-base hover:bg-orange-700">Reportar</SubmitButton>
              </form>

              <form action={submitProofAction.bind(null, tenantSlug)} className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3">
                <input name="tripId" type="hidden" value={trip.id} />
                <Field label="Nombre del receptor" name="receiverName" defaultValue="Receptor Demo" />
                <TextArea label="Observacion de entrega" name="observation" />
                <SubmitButton className="min-h-14 bg-emerald-700 text-base hover:bg-emerald-800">Registrar evidencia y firma</SubmitButton>
              </form>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
