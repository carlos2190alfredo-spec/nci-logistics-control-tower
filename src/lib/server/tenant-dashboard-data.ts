import { getDb } from "@/lib/server/db";

export async function getTenantRequests(tenantId: string) {
  return getDb().serviceRequest.findMany({
    where: { tenantId, status: { in: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"] } },
    include: { customerAccount: true, serviceType: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTenantActiveTrips(tenantId: string) {
  return getDb().trip.findMany({
    where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] } },
    include: {
      customerAccount: true,
      driver: true,
      vehicle: true,
      equipment: true,
      proof: true,
      documents: true,
      events: true,
      stops: true,
      routeEstimates: true,
      driverRecommendations: true,
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getTenantClosedTrips(tenantId: string, take = 20) {
  return getDb().trip.findMany({
    where: { tenantId, status: { in: ["CLOSED", "CANCELLED"] } },
    include: { customerAccount: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getTenantVehicles(tenantId: string) {
  return getDb().vehicle.findMany({ where: { tenantId }, orderBy: { plate: "asc" } });
}

export async function getTenantEquipment(tenantId: string) {
  return getDb().equipment.findMany({ where: { tenantId }, orderBy: { code: "asc" } });
}

export async function getTenantDrivers(tenantId: string) {
  return getDb().driver.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
}

export async function getTenantIncidents(tenantId: string, take = 50) {
  return getDb().incident.findMany({
    where: { tenantId, status: { not: "RESOLVED" } },
    include: { trip: { select: { reference: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getTenantOpenIncidentCount(tenantId: string) {
  return getDb().incident.count({
    where: { tenantId, status: { not: "RESOLVED" } },
  });
}

export async function getTenantNotifications(tenantId: string, take = 30) {
  return getDb().notificationDelivery.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getTenantOverview(tenantId: string) {
  const [requests, activeTrips, closedTrips, vehicles, equipment, drivers, incidents, openIncidentCount, notifications] =
    await Promise.all([
      getTenantRequests(tenantId),
      getTenantActiveTrips(tenantId),
      getTenantClosedTrips(tenantId, 6),
      getTenantVehicles(tenantId),
      getTenantEquipment(tenantId),
      getTenantDrivers(tenantId),
      getTenantIncidents(tenantId, 5),
      getTenantOpenIncidentCount(tenantId),
      getTenantNotifications(tenantId, 5),
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
