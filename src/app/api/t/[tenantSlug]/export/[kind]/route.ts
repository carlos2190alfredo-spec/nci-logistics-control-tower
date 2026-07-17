import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom } from "@/lib/server/http-security";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { audit } from "@/lib/server/audit";
import { toCsv, type CsvColumn } from "@/lib/export/csv";
import {
  incidentPriorityLabel,
  incidentStatusLabel,
  tripStatusLabel,
} from "@/lib/ui/status";
import {
  containerOperationLabel,
  containerSizeLabel,
  containerStatusLabel,
  containerTypeLabel,
} from "@/lib/ui/containers";

const EXPORTABLE = ["trips", "incidents", "containers"] as const;
type ExportKind = (typeof EXPORTABLE)[number];

function isExportKind(v: string): v is ExportKind {
  return (EXPORTABLE as readonly string[]).includes(v);
}

/**
 * Exporta datos operativos del tenant como CSV descargable.
 * - Solo roles con vision operativa.
 * - Aislamiento por tenantId (nunca del cliente).
 * - Rate limit para evitar dumps masivos.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; kind: string }> },
) {
  const { tenantSlug, kind } = await params;

  if (!isExportKind(kind)) {
    return new NextResponse("Tipo de exportacion no valido", { status: 404 });
  }

  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "DISPATCHER",
    "SAFETY_MANAGER",
  ]);

  const rate = await enforceRateLimit({
    scope: "export.csv",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  let csv: string;
  let filename: string;

  if (kind === "trips") {
    const trips = await db.trip.findMany({
      where: { tenantId: tenant.id },
      include: { customerAccount: true, driver: true, vehicle: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const columns: CsvColumn<(typeof trips)[number]>[] = [
      { header: "Referencia", value: (t) => t.reference },
      { header: "Estado", value: (t) => tripStatusLabel[t.status] ?? t.status },
      { header: "Cliente", value: (t) => t.customerAccount?.name ?? "" },
      { header: "Origen", value: (t) => t.origin },
      { header: "Destino", value: (t) => t.destination },
      { header: "Conductor", value: (t) => t.driver?.name ?? "" },
      { header: "Vehiculo", value: (t) => t.vehicle?.plate ?? "" },
      { header: "Programado", value: (t) => t.scheduledAt },
      { header: "Creado", value: (t) => t.createdAt },
      { header: "Actualizado", value: (t) => t.updatedAt },
    ];
    csv = toCsv(trips, columns);
    filename = `${tenant.slug}-viajes.csv`;
  } else if (kind === "containers") {
    const containers = await db.container.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const columns: CsvColumn<(typeof containers)[number]>[] = [
      { header: "Referencia", value: (c) => c.reference },
      { header: "Contenedor", value: (c) => c.containerNumber ?? "" },
      { header: "Operacion", value: (c) => containerOperationLabel[c.operationType] ?? c.operationType },
      { header: "Tamano", value: (c) => containerSizeLabel[c.size] ?? c.size },
      { header: "Tipo", value: (c) => containerTypeLabel[c.type] ?? c.type },
      { header: "Estado", value: (c) => containerStatusLabel[c.status] ?? c.status },
      { header: "Naviera", value: (c) => c.shippingLine ?? "" },
      { header: "Terminal", value: (c) => c.terminal ?? "" },
      { header: "Booking", value: (c) => c.booking ?? "" },
      { header: "Dias libres", value: (c) => (c.freeDays != null ? String(c.freeDays) : "") },
      { header: "Gate-out", value: (c) => c.gateOutAt },
      { header: "Devolucion limite", value: (c) => c.returnDeadline },
      { header: "Vacio devuelto", value: (c) => c.emptyReturnedAt },
      { header: "Creado", value: (c) => c.createdAt },
    ];
    csv = toCsv(containers, columns);
    filename = `${tenant.slug}-contenedores.csv`;
  } else {
    const incidents = await db.incident.findMany({
      where: { tenantId: tenant.id },
      include: { trip: { select: { reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const columns: CsvColumn<(typeof incidents)[number]>[] = [
      { header: "Categoria", value: (i) => i.category },
      { header: "Estado", value: (i) => incidentStatusLabel[i.status] ?? i.status },
      { header: "Prioridad", value: (i) => incidentPriorityLabel[i.priority] ?? i.priority },
      { header: "Viaje", value: (i) => i.trip?.reference ?? "" },
      { header: "Descripcion interna", value: (i) => i.internalDescription },
      { header: "Mensaje al cliente", value: (i) => i.customerMessage ?? "" },
      { header: "Visible al cliente", value: (i) => (i.visibleToCustomer ? "Si" : "No") },
      { header: "Creada", value: (i) => i.createdAt },
    ];
    csv = toCsv(incidents, columns);
    filename = `${tenant.slug}-incidencias.csv`;
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "export.csv",
    entity: "Tenant",
    entityId: tenant.id,
    after: { kind },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
