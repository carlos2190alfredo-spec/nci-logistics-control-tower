import { getDb } from "@/lib/server/db";
import { sanitizeAiInput, markUntrustedContent, limitContextSize } from "./prompt-safety";

export interface OperationsContext {
  tenantName: string;
  activeTrips: number;
  tripsWithoutDriver: number;
  tripsWithoutEta: number;
  driversWithoutSchedule: number;
  overloadedDrivers: number;
  pendingEvidence: number;
  recentIncidents: number;
  openAlerts: number;
  tripsToday: Array<{ id: string; status: string; driverName: string | null; destination: string | null }>;
  driversNeedingAttention: Array<{ name: string; reason: string }>;
}

export async function buildTenantOperationsContext(tenantId: string): Promise<string> {
  const db = getDb();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  const [
    activeTrips,
    tripsWithoutDriver,
    tripsWithoutEta,
    driversWithoutSchedule,
    overloadedDrivers,
    pendingEvidence,
    recentIncidents,
    openAlerts,
  ] = await Promise.all([
    db.trip.count({ where: { tenantId, status: { notIn: ["CANCELLED", "CLOSED"] } } }),
    db.trip.count({ where: { tenantId, driverId: null, status: { notIn: ["CANCELLED", "CLOSED"] } } }),
    db.trip.count({
      where: { tenantId, status: { notIn: ["CANCELLED", "CLOSED"] }, routeEstimates: { none: {} } },
    }),
    db.driver.count({
      where: { tenantId, status: "AVAILABLE", workSchedules: { none: {} } },
    }),
    db.driver.count({
      where: {
        tenantId,
        trips: { some: { scheduledAt: { gte: startOfDay }, status: { notIn: ["CANCELLED", "CLOSED"] } } },
      },
    }),
    db.trip.count({ where: { tenantId, status: "EVIDENCE_PENDING" } }),
    db.incident.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    db.operationalAlert.count({ where: { tenantId, resolvedAt: null } }),
  ]);

  const tripsToday = await db.trip.findMany({
    where: { tenantId, scheduledAt: { gte: startOfDay }, status: { notIn: ["CANCELLED", "CLOSED"] } },
    select: { id: true, status: true, driver: { select: { name: true } }, destination: true },
    take: 20,
    orderBy: { scheduledAt: "asc" },
  });

  const ctx: OperationsContext = {
    tenantName: tenant.name,
    activeTrips,
    tripsWithoutDriver,
    tripsWithoutEta,
    driversWithoutSchedule,
    overloadedDrivers,
    pendingEvidence,
    recentIncidents,
    openAlerts,
    tripsToday: tripsToday.map((t) => ({
      id: t.id.slice(0, 8),
      status: t.status,
      driverName: t.driver?.name ?? null,
      destination: t.destination ? sanitizeAiInput(t.destination).slice(0, 60) : null,
    })),
    driversNeedingAttention: [],
  };

  return limitContextSize(JSON.stringify(ctx));
}

export async function buildTripRiskContext(tenantId: string, tripId: string): Promise<string> {
  const db = getDb();
  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId },
    include: {
      driver: { select: { name: true, status: true } },
      stops: { select: { sequence: true, type: true, label: true }, orderBy: { sequence: "asc" } },
      routeEstimates: { select: { status: true, provider: true, distanceMeters: true, durationSeconds: true }, orderBy: { createdAt: "desc" }, take: 1 },
      driverRecommendations: { select: { score: true, riskLevel: true, explanation: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      incidents: { select: { category: true, internalDescription: true, createdAt: true }, take: 5 },
    },
  });

  const ctx = {
    tripId: trip.id.slice(0, 8),
    status: trip.status,
    scheduledAt: trip.scheduledAt.toISOString(),
    origin: sanitizeAiInput(trip.origin).slice(0, 60),
    destination: sanitizeAiInput(trip.destination).slice(0, 60),
    driverAssigned: !!trip.driverId,
    driverName: trip.driver?.name ?? null,
    driverStatus: trip.driver?.status ?? null,
    stopsCount: trip.stops.length,
    hasRouteEstimate: trip.routeEstimates.length > 0,
    routeEstimate: trip.routeEstimates[0] ?? null,
    recommendation: trip.driverRecommendations[0] ?? null,
    incidentsCount: trip.incidents.length,
    incidents: trip.incidents.map((i) => ({
      category: i.category,
      description: i.internalDescription ? markUntrustedContent(sanitizeAiInput(i.internalDescription).slice(0, 100)) : null,
    })),
  };

  return limitContextSize(JSON.stringify(ctx));
}

export async function buildFeedbackContext(tenantId: string): Promise<string> {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const feedback = await db.tenantFeedback.findMany({
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    select: { category: true, status: true, title: true, createdAt: true },
    take: 30,
    orderBy: { createdAt: "desc" },
  });

  const ctx = {
    totalFeedback: feedback.length,
    byCategory: groupBy(feedback, "category"),
    byStatus: groupBy(feedback, "status"),
    titles: feedback.map((f) => markUntrustedContent(sanitizeAiInput(f.title).slice(0, 80))),
  };

  return limitContextSize(JSON.stringify(ctx));
}

export async function buildIncidentContext(tenantId: string): Promise<string> {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const incidents = await db.incident.findMany({
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    select: {
      category: true,
      internalDescription: true,
      createdAt: true,
      trip: { select: { driver: { select: { name: true } } } },
    },
    take: 30,
    orderBy: { createdAt: "desc" },
  });

  const ctx = {
    totalIncidents: incidents.length,
    byCategory: groupBy(incidents, "category"),
    items: incidents.map((i) => ({
      category: i.category,
      driverName: i.trip?.driver?.name ?? null,
      description: i.internalDescription ? markUntrustedContent(sanitizeAiInput(i.internalDescription).slice(0, 100)) : null,
      date: i.createdAt.toISOString().slice(0, 10),
    })),
  };

  return limitContextSize(JSON.stringify(ctx));
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = String(item[key]);
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}
