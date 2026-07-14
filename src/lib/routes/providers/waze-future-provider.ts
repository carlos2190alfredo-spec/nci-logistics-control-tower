import { createHash } from "node:crypto";
import type { IRouteProvider, RouteEstimateRequest, RouteEstimateResult, RouteProviderStatus } from "../types";

export class WazeFutureProvider implements IRouteProvider {
  readonly name = "WAZE_FUTURE" as const;

  getStatus(): RouteProviderStatus {
    return {
      provider: this.name,
      available: false,
      reason: "Waze Transport SDK requiere activacion futura/partner SDK. Use Google Routes como proveedor principal de ETA.",
    };
  }

  async estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult> {
    const data = JSON.stringify({
      o: [request.origin.latitude, request.origin.longitude],
      d: [request.destination.latitude, request.destination.longitude],
    });
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 32);

    return {
      provider: this.name,
      status: "NOT_REQUESTED",
      legs: [],
      safeErrorMessage: "Waze Transport SDK no esta disponible. Use Google Routes.",
      providerRequestHash: hash,
    };
  }
}
