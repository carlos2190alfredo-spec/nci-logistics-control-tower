import { getDb } from "@/lib/server/db";
import type { TenantContext } from "./types";

export async function buildTenantContext(tenantId: string): Promise<TenantContext> {
  const db = getDb();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d14 = new Date(now.getTime() - 14 * 86400000);

  const [
    tenant,
    totalVehicles,
    activeVehicles,
    vehiclesWithTrips,
    totalDrivers,
    activeDrivers,
    incidentsByDriver,
    tripsLast7d,
    tripsLast30d,
    deliveredLast7d,
    cancelledLast7d,
    totalCustomers,
    activeAlerts,
    totalFiles30dAgo,
    totalFilesNow,
  ] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
    db.vehicle.count({ where: { tenantId } }),
    db.vehicle.count({ where: { tenantId, status: "AVAILABLE" } }),
    db.trip.groupBy({
      by: ["vehicleId"],
      where: { tenantId, createdAt: { gte: d30 }, vehicleId: { not: null } },
    }),
    db.driver.count({ where: { tenantId } }),
    db.driver.count({ where: { tenantId, status: "AVAILABLE" } }),
    db.incident.groupBy({
      by: ["tripId"],
      where: { tenantId, createdAt: { gte: d30 } },
      _count: true,
    }),
    db.trip.count({ where: { tenantId, createdAt: { gte: d7 } } }),
    db.trip.count({ where: { tenantId, createdAt: { gte: d30 } } }),
    db.trip.count({ where: { tenantId, status: "DELIVERED", updatedAt: { gte: d7 } } }),
    db.trip.count({ where: { tenantId, status: "CANCELLED", updatedAt: { gte: d7 } } }),
    db.customerAccount.count({ where: { tenantId, active: true } }),
    db.operationalAlert.count({ where: { status: "ACTIVE" } }),
    db.fileAttachment.count({ where: { tenantId, createdAt: { lt: d30 } } }),
    db.fileAttachment.count({ where: { tenantId } }),
  ]);

  const driversWithTrips = await db.trip.findMany({
    where: { tenantId, driverId: { not: null }, createdAt: { gte: d14 } },
    select: { driverId: true },
    distinct: ["driverId"],
  });
  const activeDriverIds = new Set(driversWithTrips.map((t) => t.driverId).filter(Boolean));
  const allDrivers = await db.driver.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const idleDrivers = allDrivers
    .filter((d) => !activeDriverIds.has(d.id))
    .map((d) => ({ driverId: d.id, name: d.name, lastTripDaysAgo: 14 }));

  const pendingRequests = await db.serviceRequest.groupBy({
    by: ["customerAccountId"],
    where: { tenantId, status: { in: ["REQUESTED", "UNDER_REVIEW"] } },
    _count: true,
  });
  const customerIds = pendingRequests.map((p) => p.customerAccountId);
  const customerNames = customerIds.length
    ? await db.customerAccount.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const customerNameMap = new Map(customerNames.map((c) => [c.id, c.name]));

  const unusedServiceTypes = await db.serviceType.findMany({
    where: {
      tenantId,
      active: true,
      NOT: { trips: { some: { createdAt: { gte: d30 } } } },
    },
    select: { id: true, name: true },
  });

  const recurringAlerts = await db.operationalAlert.findMany({
    where: { status: "ACTIVE", occurrenceCount: { gte: 3 } },
    select: { title: true, occurrenceCount: true },
    take: 10,
  });

  const fileGrowthPercent = totalFiles30dAgo > 0
    ? Math.round(((totalFilesNow - totalFiles30dAgo) / totalFiles30dAgo) * 100)
    : 0;

  return {
    tenantId,
    tenantName: tenant.name,
    fleet: {
      totalVehicles,
      activeVehicles,
      vehiclesWithTripsLast30d: vehiclesWithTrips.length,
    },
    drivers: {
      totalDrivers,
      activeDrivers,
      driversWithIncidentsLast30d: incidentsByDriver.map((g) => ({
        driverId: g.tripId ?? "unknown",
        name: "N/A",
        count: g._count,
      })),
      idleDrivers,
    },
    operations: {
      tripsLast7d,
      tripsLast30d,
      deliveredLast7d,
      cancelledLast7d,
      avgCompletionDays: 0,
    },
    customers: {
      totalCustomers,
      customersWithVolumeDrops: [],
      customersWithPendingRequests: pendingRequests
        .filter((p) => p._count >= 5)
        .map((p) => ({
          customerId: p.customerAccountId,
          name: customerNameMap.get(p.customerAccountId) ?? "N/A",
          pendingCount: p._count,
        })),
    },
    serviceTypes: {
      unusedServiceTypes: unusedServiceTypes.map((s) => ({
        id: s.id,
        name: s.name,
        daysSinceLastUse: 30,
      })),
    },
    system: {
      activeAlerts,
      recurringAlerts: recurringAlerts.map((a) => ({
        title: a.title,
        count: a.occurrenceCount,
      })),
      fileGrowthPercent,
    },
  };
}
