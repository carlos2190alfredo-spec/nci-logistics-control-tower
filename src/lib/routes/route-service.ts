import type { IRouteProvider, RouteEstimateRequest, RouteEstimateResult, RouteProviderStatus } from "./types";
import { DisabledRouteProvider } from "./providers/disabled-route-provider";
import { SimulatedRouteProvider } from "./providers/simulated-route-provider";
import { GoogleRoutesProvider } from "./providers/google-routes-provider";
import { WazeFutureProvider } from "./providers/waze-future-provider";

export type RouteMode = "disabled" | "simulated" | "google";

export function getRouteMode(): RouteMode {
  const mode = process.env.GOOGLE_MAPS_ROUTES_MODE?.toLowerCase();
  if (mode === "google") return "google";
  if (mode === "simulated") return "simulated";
  return "disabled";
}

export function createRouteProvider(mode?: RouteMode): IRouteProvider {
  const resolvedMode = mode ?? getRouteMode();
  switch (resolvedMode) {
    case "google":
      return new GoogleRoutesProvider(process.env.GOOGLE_MAPS_API_KEY);
    case "simulated":
      return new SimulatedRouteProvider();
    default:
      return new DisabledRouteProvider();
  }
}

export function getRouteProviderStatus(mode?: RouteMode): RouteProviderStatus {
  return createRouteProvider(mode).getStatus();
}

export function getWazeFutureStatus(): RouteProviderStatus {
  return new WazeFutureProvider().getStatus();
}

export async function estimateRoute(
  request: RouteEstimateRequest,
  mode?: RouteMode,
): Promise<RouteEstimateResult> {
  const provider = createRouteProvider(mode);
  return provider.estimate(request);
}
