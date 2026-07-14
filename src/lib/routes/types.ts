import type { RouteProvider as RouteProviderEnum } from "@/generated/prisma";

export interface RoutePoint {
  latitude: number;
  longitude: number;
  label?: string;
  placeId?: string;
}

export interface RouteStop {
  id: string;
  sequence: number;
  type: "START" | "PICKUP" | "DELIVERY" | "RETURN" | "OTHER";
  point: RoutePoint;
  label?: string;
}

export interface RouteEstimateRequest {
  tenantId: string;
  tripId: string;
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints: RouteStop[];
  departureTime?: Date;
  routingPreference?: "TRAFFIC_UNAWARE" | "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL";
}

export interface RouteEstimateLeg {
  stopId: string;
  sequence: number;
  distanceMeters: number;
  durationSeconds: number;
  trafficDurationSeconds?: number;
  estimatedArrivalAt?: Date;
}

export interface RouteEstimateResult {
  provider: RouteProviderEnum;
  status: "ESTIMATED" | "FAILED" | "NOT_REQUESTED";
  distanceMeters?: number;
  durationSeconds?: number;
  trafficDurationSeconds?: number;
  staticDurationSeconds?: number;
  routeSummary?: string;
  legs: RouteEstimateLeg[];
  polylineEncoded?: string;
  errorCode?: string;
  safeErrorMessage?: string;
  providerRequestHash: string;
}

export interface RouteProviderStatus {
  provider: RouteProviderEnum;
  available: boolean;
  reason?: string;
}

export interface IRouteProvider {
  readonly name: RouteProviderEnum;
  getStatus(): RouteProviderStatus;
  estimate(request: RouteEstimateRequest): Promise<RouteEstimateResult>;
}
