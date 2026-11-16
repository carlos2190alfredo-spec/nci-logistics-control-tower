import type { TenantRole } from "@/generated/prisma";
import { OPERATIONS_INBOX_REQUEST_STATUSES } from "@/lib/domain/request-state-machine";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

/**
 * Quien consulta la vista operativa: tenant resuelto en servidor desde la ruta y
 * rol de su membresia verificada. Nunca proviene del navegador.
 */
export type TenantViewer = { tenantId: string; role: TenantRole };

/**
 * Las consultas de la vista operativa (todos los viajes, solicitudes,
 * incidencias, notificaciones) exigen `tenant.view`: ademas del guard de cada
 * pagina, el cargador falla cerrado si lo invoca un rol sin esa vista (p. ej. el
 * conductor).
 */
function assertCanViewOperations(viewer: TenantViewer) {
  if (!hasPermission(viewer.role, "tenant.view")) {
    throw new Error("El rol no tiene acceso a la vista operativa de la empresa.");
  }
}

export async function getTenantRequests(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  return getDb().serviceRequest.findMany({
    where: { tenantId: viewer.tenantId, status: { in: OPERATIONS_INBOX_REQUEST_STATUSES } },
    include: { customerAccount: true, serviceType: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTenantActiveTrips(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  const trips = await getDb().trip.findMany({
    where: { tenantId: viewer.tenantId, status: { notIn: ["CLOSED", "CANCELLED"] } },
    include: {
      customerAccount: true,
      driver: true,
      vehicle: true,
      equipment: true,
      serviceType: { select: { name: true, code: true, requiresEquipment: true } },
      serviceRequest: { select: { cargoDetails: true, priority: true, source: true, internalNotes: true } },
      proof: true,
      documents: true,
      events: true,
      stops: true,
      routeEstimates: true,
      driverRecommendations: true,
    },
    orderBy: { scheduledAt: "asc" },
  });
  // El motivo de las excepciones es interno: solo lo ven los roles con
  // `tenant.exceptions.view` (mando y seguridad), no el despachador.
  if (hasPermission(viewer.role, "tenant.exceptions.view")) return trips;
  return trips.map((trip) => ({ ...trip, events: trip.events.map((event) => ({ ...event, reason: null })) }));
}

export async function getTenantClosedTrips(viewer: TenantViewer, take = 20) {
  assertCanViewOperations(viewer);
  return getDb().trip.findMany({
    where: { tenantId: viewer.tenantId, status: { in: ["CLOSED", "CANCELLED"] } },
    include: { customerAccount: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getTenantVehicles(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  return getDb().vehicle.findMany({
    where: { tenantId: viewer.tenantId, status: { not: "INACTIVE" } },
    orderBy: { plate: "asc" },
  });
}

export async function getTenantEquipment(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  return getDb().equipment.findMany({
    where: { tenantId: viewer.tenantId, status: { not: "INACTIVE" } },
    orderBy: { code: "asc" },
  });
}

export async function getTenantDrivers(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  return getDb().driver.findMany({ where: { tenantId: viewer.tenantId }, orderBy: { name: "asc" } });
}

export async function getTenantIncidents(viewer: TenantViewer, take = 50) {
  assertCanViewOperations(viewer);
  return getDb().incident.findMany({
    where: { tenantId: viewer.tenantId, status: { not: "RESOLVED" } },
    include: { trip: { select: { reference: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getTenantOpenIncidentCount(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  return getDb().incident.count({
    where: { tenantId: viewer.tenantId, status: { not: "RESOLVED" } },
  });
}

export async function getTenantNotifications(viewer: TenantViewer, take = 30) {
  assertCanViewOperations(viewer);
  return getDb().notificationDelivery.findMany({
    where: { tenantId: viewer.tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getTenantOverview(viewer: TenantViewer) {
  assertCanViewOperations(viewer);
  const [requests, activeTrips, closedTrips, vehicles, equipment, drivers, incidents, openIncidentCount, notifications] =
    await Promise.all([
      getTenantRequests(viewer),
      getTenantActiveTrips(viewer),
      getTenantClosedTrips(viewer, 6),
      getTenantVehicles(viewer),
      getTenantEquipment(viewer),
      getTenantDrivers(viewer),
      getTenantIncidents(viewer, 5),
      getTenantOpenIncidentCount(viewer),
      getTenantNotifications(viewer, 5),
    ]);

  const pendingProofs = activeTrips.reduce(
    (n, t) => n + (t.proof && t.proof.status === "SUBMITTED" ? 1 : 0),
    0,
  );

  return {
    requests,
    activeTrips,
    closedTrips,
    vehicles,
    equipment,
    drivers,
    incidents,
    openIncidentCount,
    notifications,
    pendingProofs,
  };
}
