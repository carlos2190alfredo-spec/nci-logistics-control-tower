"use server";

import { tenantCalendarDate, tenantDayBounds } from "@/lib/datetime";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { recommendDriverForTrip } from "@/lib/ai/driver-recommendation";
import type { DriverCandidate, DriverStats, AssignedTrip } from "@/lib/ai/driver-recommendation";

export async function generateDriverRecommendationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();

  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId: tenant.id },
    include: {
      vehicle: true,
      routeEstimates: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const drivers = await db.driver.findMany({
    where: { tenantId: tenant.id },
    include: { trips: { where: { tenantId: tenant.id }, select: { id: true } } },
  });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  // El día del viaje es el de la EMPRESA (Panamá), no el de la zona del servidor.
  const dayBounds = tenantDayBounds(trip.scheduledAt);
  const tripDate = tenantCalendarDate(trip.scheduledAt);
  if (!dayBounds || !tripDate) throw new Error("La fecha del viaje no es válida.");

  const workSchedules = await db.driverWorkSchedule.findMany({
    where: { tenantId: tenant.id, driverId: { in: drivers.map((d) => d.id) } },
  });

  const availabilityExceptions = await db.driverAvailabilityException.findMany({
    where: {
      tenantId: tenant.id,
      driverId: { in: drivers.map((d) => d.id) },
      date: tripDate, // columna @db.Date: la fecha local del viaje, sin hora
    },
  });

  const assignedTripsData = await db.trip.findMany({
    where: {
      tenantId: tenant.id,
      driverId: { in: drivers.map((d) => d.id) },
      scheduledAt: { gte: dayBounds.start, lt: dayBounds.end },
      status: { notIn: ["CANCELLED", "CLOSED"] },
    },
    select: {
      id: true,
      driverId: true,
      scheduledAt: true,
      expectedDuration: true,
      status: true,
    },
  });

  const incidents = await db.incident.groupBy({
    by: ["tripId"],
    where: {
      tenantId: tenant.id,
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: true,
  });

  const tripDriverMap = new Map<string, string>();
  const allTrips = await db.trip.findMany({
    where: {
      tenantId: tenant.id,
      id: { in: incidents.map((i) => i.tripId).filter(Boolean) as string[] },
    },
    select: { id: true, driverId: true },
  });
  for (const t of allTrips) {
    if (t.driverId) tripDriverMap.set(t.id, t.driverId);
  }

  const driverIncidentMap = new Map<string, number>();
  for (const inc of incidents) {
    if (inc.tripId) {
      const did = tripDriverMap.get(inc.tripId);
      if (did) {
        driverIncidentMap.set(did, (driverIncidentMap.get(did) ?? 0) + inc._count);
      }
    }
  }

  const driverCandidates: DriverCandidate[] = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    status: d.status,
    vehicleType: trip.vehicle?.type,
    tenantId: d.tenantId,
  }));

  const assignedTrips: AssignedTrip[] = assignedTripsData.map((t) => ({
    tripId: t.id,
    driverId: t.driverId!,
    scheduledAt: t.scheduledAt,
    estimatedEndAt: new Date(t.scheduledAt.getTime() + t.expectedDuration * 1000),
    status: t.status,
  }));

  const driverStatsArr: DriverStats[] = drivers.map((d) => {
    const tripsToday = assignedTripsData.filter((t) => t.driverId === d.id).length;
    return {
      driverId: d.id,
      incidentsLast30d: driverIncidentMap.get(d.id) ?? 0,
      tripsToday,
      lastPwaSyncAt: null,
    };
  });

  const latestEstimate = trip.routeEstimates[0];

  const result = recommendDriverForTrip({
    tenantId: tenant.id,
    tripId: trip.id,
    plannedStartAt: trip.scheduledAt,
    requiredVehicleType: trip.vehicle?.type,
    drivers: driverCandidates,
    workSchedules: workSchedules.map((ws) => ({
      driverId: ws.driverId,
      dayOfWeek: ws.dayOfWeek,
      startTimeLocal: ws.startTimeLocal,
      endTimeLocal: ws.endTimeLocal,
      breakStartLocal: ws.breakStartLocal,
      breakEndLocal: ws.breakEndLocal,
      isActive: ws.isActive,
    })),
    availabilityExceptions: availabilityExceptions.map((e) => ({
      driverId: e.driverId,
      date: e.date,
      type: e.type,
      startTimeLocal: e.startTimeLocal,
      endTimeLocal: e.endTimeLocal,
    })),
    assignedTrips,
    driverStats: driverStatsArr,
    estimatedDurationSeconds: latestEstimate?.durationSeconds ?? undefined,
  });

  await db.driverAssignmentRecommendation.deleteMany({
    where: { tenantId: tenant.id, tripId: trip.id, status: "GENERATED" },
  });

  const allScored = [
    ...(result.recommended ? [result.recommended] : []),
    ...result.alternatives,
    ...result.disqualified,
  ];

  if (allScored.length > 0) {
    await db.driverAssignmentRecommendation.createMany({
      data: allScored.map((s, i) => ({
        tenantId: tenant.id,
        tripId: trip.id,
        driverId: s.driverId,
        status: "GENERATED" as const,
        score: s.score,
        rank: i + 1,
        recommendationTitle: s.isEligible
          ? `Conductor ${s.driverName} — Score ${s.score}`
          : `Descartado: ${s.driverName}`,
        explanation: s.isEligible
          ? s.reasons.join(". ")
          : s.disqualificationReason ?? "No elegible",
        riskLevel: result.riskLevel,
        reasonsJson: s.reasons,
        warningsJson: s.warnings,
        generatedBy: "RULES_ENGINE" as const,
      })),
    });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.recommendation.generated",
    entity: "Trip",
    entityId: trip.id,
    after: {
      recommendedDriver: result.recommended?.driverName ?? null,
      score: result.recommended?.score ?? null,
      riskLevel: result.riskLevel,
      candidatesEvaluated: allScored.length,
    },
  });

  revalidatePath(`/t/${tenantSlug}`);
}

export async function acceptDriverRecommendationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const recommendationId = String(formData.get("recommendationId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();

  const rec = await db.driverAssignmentRecommendation.findFirstOrThrow({
    where: { id: recommendationId, tenantId: tenant.id },
  });

  if (!rec.driverId) {
    return;
  }

  await db.driverAssignmentRecommendation.update({
    where: { id: rec.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  // ADR-035: aceptar una recomendacion NO asigna el viaje. La asignacion real
  // pasa siempre por `assignTripAction`, que aplica las guardas de estado,
  // cumplimiento, mantenimiento y conflicto de agenda con bloqueo de filas.

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.recommendation.accepted",
    entity: "DriverAssignmentRecommendation",
    entityId: rec.id,
    after: { driverId: rec.driverId, tripId: rec.tripId },
  });

  revalidatePath(`/t/${tenantSlug}`);
  return;
}

export async function overrideDriverRecommendationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  if (!overrideReason) {
    return;
  }

  const db = getDb();

  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId: tenant.id },
  });

  const driver = await db.driver.findFirstOrThrow({
    where: { id: driverId, tenantId: tenant.id },
  });

  await db.driverAssignmentRecommendation.updateMany({
    where: { tenantId: tenant.id, tripId: trip.id, status: "GENERATED" },
    data: { status: "OVERRIDDEN", overrideReason, dismissedAt: new Date() },
  });

  // ADR-035: anular la recomendacion solo registra la decision y su motivo;
  // la asignacion real pasa por `assignTripAction` con todas sus guardas.

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.recommendation.overridden",
    entity: "Trip",
    entityId: trip.id,
    after: { driverId: driver.id, overrideReason },
  });

  revalidatePath(`/t/${tenantSlug}`);
  return;
}
