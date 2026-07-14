import { createHash } from "node:crypto";
import type { IRouteProvider, RouteEstimateRequest, RouteEstimateResult, RouteProviderStatus } from "../types";

export class DisabledRouteProvider implements IRouteProvider {
  readonly name = "DISABLED" as const;

  getStatus(): RouteProviderStatus {
    return {
      provider: this.name,
      available: false,
      reason: "Proveedor de rutas desactivado. Configure GOOGLE_MAPS_ROUTES_MODE para activar.",
    };
  }

  async estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult> {
    return {
      provider: this.name,
      status: "NOT_REQUESTED",
      legs: [],
      safeErrorMessage: "Proveedor de rutas desactivado.",
      providerRequestHash: hashRequest(request),
    };
  }
}

function hashRequest(req: RouteEstimateRequest): string {
  const data = JSON.stringify({
    o: [req.origin.latitude, req.origin.longitude],
    d: [req.destination.latitude, req.destination.longitude],
    w: req.waypoints.map((w) => [w.point.latitude, w.point.longitude]),
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 32);
}
