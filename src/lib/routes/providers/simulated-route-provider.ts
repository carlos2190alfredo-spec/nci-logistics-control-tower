import { createHash } from "node:crypto";
import type { IRouteProvider, RouteEstimateRequest, RouteEstimateResult, RouteEstimateLeg, RouteProviderStatus, RoutePoint } from "../types";

const AVG_SPEED_KMH = 60;
const EARTH_RADIUS_KM = 6371;

export class SimulatedRouteProvider implements IRouteProvider {
  readonly name = "SIMULATED" as const;

  getStatus(): RouteProviderStatus {
    return {
      provider: this.name,
      available: true,
      reason: "Estimacion basica por distancia haversine. Sin datos de trafico.",
    };
  }

  async estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult> {
    const allPoints: { point: RoutePoint; stopId: string; sequence: number }[] = [];
    allPoints.push({ point: request.origin, stopId: "", sequence: 0 });
    for (const wp of request.waypoints) {
      allPoints.push({ point: wp.point, stopId: wp.id, sequence: wp.sequence });
    }
    allPoints.push({ point: request.destination, stopId: "", sequence: request.waypoints.length + 1 });

    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    const legs: RouteEstimateLeg[] = [];
    const departureTime = request.departureTime ?? new Date();
    let currentTime = departureTime.getTime();

    for (let i = 1; i < allPoints.length; i++) {
      const from = allPoints[i - 1].point;
      const to = allPoints[i].point;
      const distKm = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
      const distMeters = Math.round(distKm * 1000);
      const durationSec = Math.round((distKm / AVG_SPEED_KMH) * 3600);

      totalDistanceMeters += distMeters;
      totalDurationSeconds += durationSec;
      currentTime += durationSec * 1000;

      if (allPoints[i].stopId) {
        legs.push({
          stopId: allPoints[i].stopId,
          sequence: allPoints[i].sequence,
          distanceMeters: distMeters,
          durationSeconds: durationSec,
          estimatedArrivalAt: new Date(currentTime),
        });
      }
    }

    const summaryParts: string[] = [];
    summaryParts.push(`${(totalDistanceMeters / 1000).toFixed(1)} km`);
    summaryParts.push(`~${Math.ceil(totalDurationSeconds / 60)} min`);
    summaryParts.push(`${allPoints.length} puntos`);

    return {
      provider: this.name,
      status: "ESTIMATED",
      distanceMeters: totalDistanceMeters,
      durationSeconds: totalDurationSeconds,
      staticDurationSeconds: totalDurationSeconds,
      routeSummary: `Estimacion simulada: ${summaryParts.join(", ")}`,
      legs,
      providerRequestHash: hashRequest(request),
    };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function hashRequest(req: RouteEstimateRequest): string {
  const data = JSON.stringify({
    o: [req.origin.latitude, req.origin.longitude],
    d: [req.destination.latitude, req.destination.longitude],
    w: req.waypoints.map((w) => [w.point.latitude, w.point.longitude]),
    t: req.departureTime?.toISOString(),
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 32);
}
