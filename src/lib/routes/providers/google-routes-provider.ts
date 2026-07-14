import { createHash } from "node:crypto";
import type { IRouteProvider, RouteEstimateRequest, RouteEstimateResult, RouteEstimateLeg, RouteProviderStatus } from "../types";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters";

export class GoogleRoutesProvider implements IRouteProvider {
  readonly name = "GOOGLE_ROUTES" as const;
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  getStatus(): RouteProviderStatus {
    if (!this.apiKey) {
      return {
        provider: this.name,
        available: false,
        reason: "GOOGLE_MAPS_API_KEY no configurada.",
      };
    }
    return {
      provider: this.name,
      available: true,
    };
  }

  async estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult> {
    const reqHash = hashRequest(request);

    if (!this.apiKey) {
      return {
        provider: this.name,
        status: "FAILED",
        legs: [],
        errorCode: "NO_API_KEY",
        safeErrorMessage: "Google Maps API key no configurada.",
        providerRequestHash: reqHash,
      };
    }

    const body = buildRequestBody(request);

    let response: Response;
    try {
      response = await fetch(ROUTES_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error de red";
      return {
        provider: this.name,
        status: "FAILED",
        legs: [],
        errorCode: "NETWORK_ERROR",
        safeErrorMessage: `Error de conexion con Google Routes: ${sanitizeErrorMessage(msg)}`,
        providerRequestHash: reqHash,
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        provider: this.name,
        status: "FAILED",
        legs: [],
        errorCode: `HTTP_${response.status}`,
        safeErrorMessage: `Google Routes respondio con error ${response.status}: ${sanitizeErrorMessage(errorText)}`,
        providerRequestHash: reqHash,
      };
    }

    const data = await response.json();
    return parseResponse(data, request, reqHash);
  }
}

function buildRequestBody(request: RouteEstimateRequest) {
  const origin = {
    location: {
      latLng: { latitude: request.origin.latitude, longitude: request.origin.longitude },
    },
  };

  const destination = {
    location: {
      latLng: { latitude: request.destination.latitude, longitude: request.destination.longitude },
    },
  };

  const intermediates = request.waypoints.map((wp) => ({
    location: {
      latLng: { latitude: wp.point.latitude, longitude: wp.point.longitude },
    },
  }));

  const body: Record<string, unknown> = {
    origin,
    destination,
    travelMode: "DRIVE",
    routingPreference: request.routingPreference ?? "TRAFFIC_AWARE",
  };

  if (intermediates.length > 0) {
    body.intermediates = intermediates;
  }

  if (request.departureTime) {
    body.departureTime = request.departureTime.toISOString();
  }

  return body;
}

function parseResponse(
  data: Record<string, unknown>,
  request: RouteEstimateRequest,
  reqHash: string,
): RouteEstimateResult {
  const routes = data.routes as Array<Record<string, unknown>> | undefined;
  if (!routes || routes.length === 0) {
    return {
      provider: "GOOGLE_ROUTES",
      status: "FAILED",
      legs: [],
      errorCode: "NO_ROUTES",
      safeErrorMessage: "Google Routes no devolvio rutas.",
      providerRequestHash: reqHash,
    };
  }

  const route = routes[0];
  const distanceMeters = (route.distanceMeters as number) ?? 0;
  const durationStr = (route.duration as string) ?? "0s";
  const staticDurationStr = (route.staticDuration as string) ?? durationStr;
  const durationSeconds = parseDuration(durationStr);
  const staticDurationSeconds = parseDuration(staticDurationStr);
  const description = (route.description as string) ?? undefined;
  const polyline = route.polyline as Record<string, unknown> | undefined;
  const encodedPolyline = polyline?.encodedPolyline as string | undefined;

  const routeLegs = (route.legs as Array<Record<string, unknown>>) ?? [];
  const legs: RouteEstimateLeg[] = [];
  const departureTime = request.departureTime ?? new Date();
  let currentTime = departureTime.getTime();

  for (let i = 0; i < routeLegs.length && i < request.waypoints.length; i++) {
    const leg = routeLegs[i];
    const legDist = (leg.distanceMeters as number) ?? 0;
    const legDurStr = (leg.duration as string) ?? "0s";
    const legStaticStr = (leg.staticDuration as string) ?? legDurStr;
    const legDurationSec = parseDuration(legDurStr);
    const legTrafficSec = parseDuration(legStaticStr);
    currentTime += legDurationSec * 1000;

    legs.push({
      stopId: request.waypoints[i].id,
      sequence: request.waypoints[i].sequence,
      distanceMeters: legDist,
      durationSeconds: legDurationSec,
      trafficDurationSeconds: legTrafficSec !== legDurationSec ? legTrafficSec : undefined,
      estimatedArrivalAt: new Date(currentTime),
    });
  }

  return {
    provider: "GOOGLE_ROUTES",
    status: "ESTIMATED",
    distanceMeters,
    durationSeconds,
    trafficDurationSeconds: durationSeconds !== staticDurationSeconds ? durationSeconds : undefined,
    staticDurationSeconds,
    routeSummary: description ? `Google Routes: ${description}` : "Google Routes",
    legs,
    polylineEncoded: encodedPolyline,
    providerRequestHash: reqHash,
  };
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)s$/);
  return match ? parseInt(match[1], 10) : 0;
}

function hashRequest(req: RouteEstimateRequest): string {
  const data = JSON.stringify({
    o: [req.origin.latitude, req.origin.longitude],
    d: [req.destination.latitude, req.destination.longitude],
    w: req.waypoints.map((w) => [w.point.latitude, w.point.longitude]),
    t: req.departureTime?.toISOString(),
    p: req.routingPreference,
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 32);
}

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/key=[^&\s"']*/gi, "key=***")
    .replace(/AIza[A-Za-z0-9_-]{35}/g, "***API_KEY***")
    .slice(0, 200);
}
