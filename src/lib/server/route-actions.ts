"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { estimateRoute, getRouteProviderStatus } from "@/lib/routes";
import type { RoutePoint, RouteStop } from "@/lib/routes";

export async function calculateRouteEstimateAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();

  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId: tenant.id },
    include: { stops: { orderBy: { sequence: "asc" } } },
  });

  if (trip.stops.length < 2) {
    return;
  }

  const stopsWithCoords = trip.stops.filter((s) => s.latitude != null && s.longitude != null);
  if (stopsWithCoords.length < 2) {
    return;
  }

  const origin: RoutePoint = {
    latitude: stopsWithCoords[0].latitude!,
    longitude: stopsWithCoords[0].longitude!,
    label: stopsWithCoords[0].label ?? stopsWithCoords[0].addressText,
  };
  const destination: RoutePoint = {
    latitude: stopsWithCoords[stopsWithCoords.length - 1].latitude!,
    longitude: stopsWithCoords[stopsWithCoords.length - 1].longitude!,
    label: stopsWithCoords[stopsWithCoords.length - 1].label ?? stopsWithCoords[stopsWithCoords.length - 1].addressText,
  };

  const waypoints: RouteStop[] = stopsWithCoords.slice(1, -1).map((s) => ({
    id: s.id,
    sequence: s.sequence,
    type: s.type as RouteStop["type"],
    point: { latitude: s.latitude!, longitude: s.longitude!, label: s.label ?? undefined },
  }));

  const result = await estimateRoute({
    tenantId: tenant.id,
    tripId: trip.id,
    origin,
    destination,
    waypoints,
    departureTime: trip.scheduledAt,
  });

  const existing = await db.tripRouteEstimate.findFirst({
    where: { tenantId: tenant.id, tripId: trip.id, providerRequestHash: result.providerRequestHash },
  });

  if (existing && existing.status === "ESTIMATED") {
    return;
  }

  const estimate = await db.tripRouteEstimate.create({
    data: {
      tenantId: tenant.id,
      tripId: trip.id,
      provider: result.provider,
      status: result.status === "ESTIMATED" ? "ESTIMATED" : result.status === "FAILED" ? "FAILED" : "NOT_REQUESTED",
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      trafficDurationSeconds: result.trafficDurationSeconds,
      staticDurationSeconds: result.staticDurationSeconds,
      routeSummary: result.routeSummary,
      polylineEncoded: result.polylineEncoded,
      providerRequestHash: result.providerRequestHash,
      errorCode: result.errorCode,
      safeErrorMessage: result.safeErrorMessage,
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  if (result.legs.length > 0) {
    await db.tripStopEstimate.createMany({
      data: result.legs.map((leg) => ({
        tenantId: tenant.id,
        tripId: trip.id,
        stopId: leg.stopId,
        estimatedArrivalAt: leg.estimatedArrivalAt,
        legDistanceMeters: leg.distanceMeters,
        legDurationSeconds: leg.durationSeconds,
        legTrafficDurationSeconds: leg.trafficDurationSeconds,
        sequence: leg.sequence,
      })),
    });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "route.estimate.calculated",
    entity: "TripRouteEstimate",
    entityId: estimate.id,
    after: { provider: result.provider, status: result.status, distanceMeters: result.distanceMeters },
  });

  revalidatePath(`/t/${tenantSlug}`);
  return;
}

export async function getRouteStatusAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const status = getRouteProviderStatus();
  return;
}

export async function saveTripStopsAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const stopsJson = String(formData.get("stops") ?? "[]");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();

  const trip = await db.trip.findFirstOrThrow({
    where: { id: tripId, tenantId: tenant.id },
  });

  let stops: Array<{
    type: string;
    sequence: number;
    label?: string;
    addressText: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
    contactName?: string;
    contactPhone?: string;
    instructions?: string;
    timeWindowStart?: string;
    timeWindowEnd?: string;
  }>;

  try {
    stops = JSON.parse(stopsJson);
  } catch {
    return;
  }

  if (!Array.isArray(stops) || stops.length === 0) {
    return;
  }

  const validTypes = ["START", "PICKUP", "DELIVERY", "RETURN", "OTHER"];
  for (const s of stops) {
    if (!validTypes.includes(s.type)) return;
    if (!s.addressText) return;
    if (s.latitude != null && (s.latitude < -90 || s.latitude > 90)) return;
    if (s.longitude != null && (s.longitude < -180 || s.longitude > 180)) return;
  }

  await db.tripStop.deleteMany({ where: { tenantId: tenant.id, tripId: trip.id } });

  await db.tripStop.createMany({
    data: stops.map((s, i) => ({
      tenantId: tenant.id,
      tripId: trip.id,
      type: s.type as "START" | "PICKUP" | "DELIVERY" | "RETURN" | "OTHER",
      sequence: s.sequence ?? i,
      label: s.label,
      addressText: s.addressText,
      latitude: s.latitude,
      longitude: s.longitude,
      placeId: s.placeId,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      instructions: s.instructions,
      timeWindowStart: s.timeWindowStart ? new Date(s.timeWindowStart) : undefined,
      timeWindowEnd: s.timeWindowEnd ? new Date(s.timeWindowEnd) : undefined,
    })),
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "trip.stops.saved",
    entity: "Trip",
    entityId: trip.id,
    after: { stopCount: stops.length },
  });

  revalidatePath(`/t/${tenantSlug}`);
}
