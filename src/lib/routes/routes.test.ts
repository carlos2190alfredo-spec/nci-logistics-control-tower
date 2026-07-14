import { describe, it, expect } from "vitest";
import { DisabledRouteProvider } from "./providers/disabled-route-provider";
import { SimulatedRouteProvider } from "./providers/simulated-route-provider";
import { GoogleRoutesProvider } from "./providers/google-routes-provider";
import { WazeFutureProvider } from "./providers/waze-future-provider";
import type { RouteEstimateRequest } from "./types";

const baseRequest: RouteEstimateRequest = {
  tenantId: "tenant-1",
  tripId: "trip-1",
  origin: { latitude: 8.9824, longitude: -79.5199 },
  destination: { latitude: 9.0, longitude: -79.5 },
  waypoints: [],
  departureTime: new Date("2026-07-14T10:00:00Z"),
};

const requestWithWaypoints: RouteEstimateRequest = {
  ...baseRequest,
  waypoints: [
    { id: "stop-1", sequence: 1, type: "PICKUP", point: { latitude: 8.99, longitude: -79.51 } },
    { id: "stop-2", sequence: 2, type: "DELIVERY", point: { latitude: 8.995, longitude: -79.505 } },
  ],
};

describe("DisabledRouteProvider", () => {
  const provider = new DisabledRouteProvider();

  it("reports not available", () => {
    const status = provider.getStatus();
    expect(status.available).toBe(false);
    expect(status.provider).toBe("DISABLED");
  });

  it("returns NOT_REQUESTED status", async () => {
    const result = await provider.estimate(baseRequest);
    expect(result.status).toBe("NOT_REQUESTED");
    expect(result.provider).toBe("DISABLED");
    expect(result.legs).toEqual([]);
    expect(result.providerRequestHash).toBeTruthy();
  });
});

describe("SimulatedRouteProvider", () => {
  const provider = new SimulatedRouteProvider();

  it("reports available", () => {
    const status = provider.getStatus();
    expect(status.available).toBe(true);
    expect(status.provider).toBe("SIMULATED");
  });

  it("estimates route with haversine distance", async () => {
    const result = await provider.estimate(baseRequest);
    expect(result.status).toBe("ESTIMATED");
    expect(result.provider).toBe("SIMULATED");
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.routeSummary).toContain("simulada");
    expect(result.providerRequestHash).toBeTruthy();
  });

  it("returns legs for waypoints", async () => {
    const result = await provider.estimate(requestWithWaypoints);
    expect(result.status).toBe("ESTIMATED");
    expect(result.legs.length).toBe(2);
    expect(result.legs[0].stopId).toBe("stop-1");
    expect(result.legs[1].stopId).toBe("stop-2");
    expect(result.legs[0].distanceMeters).toBeGreaterThan(0);
  });

  it("produces stable request hash for same input", async () => {
    const result1 = await provider.estimate(baseRequest);
    const result2 = await provider.estimate(baseRequest);
    expect(result1.providerRequestHash).toBe(result2.providerRequestHash);
  });

  it("produces different hash for different coordinates", async () => {
    const result1 = await provider.estimate(baseRequest);
    const modified = { ...baseRequest, origin: { latitude: 9.1, longitude: -79.6 } };
    const result2 = await provider.estimate(modified);
    expect(result1.providerRequestHash).not.toBe(result2.providerRequestHash);
  });
});

describe("GoogleRoutesProvider", () => {
  it("reports not available without API key", () => {
    const provider = new GoogleRoutesProvider();
    const status = provider.getStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("GOOGLE_MAPS_API_KEY");
  });

  it("returns FAILED without API key", async () => {
    const provider = new GoogleRoutesProvider();
    const result = await provider.estimate(baseRequest);
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("NO_API_KEY");
    expect(result.safeErrorMessage).toContain("no configurada");
  });

  it("reports available with API key", () => {
    const provider = new GoogleRoutesProvider("test-key-123");
    const status = provider.getStatus();
    expect(status.available).toBe(true);
  });

  it("does not make HTTP request without API key", async () => {
    const provider = new GoogleRoutesProvider();
    const result = await provider.estimate(baseRequest);
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("NO_API_KEY");
  });
});

describe("WazeFutureProvider", () => {
  const provider = new WazeFutureProvider();

  it("reports not available", () => {
    const status = provider.getStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("Waze");
  });

  it("returns NOT_REQUESTED status without external call", async () => {
    const result = await provider.estimate(baseRequest);
    expect(result.status).toBe("NOT_REQUESTED");
    expect(result.provider).toBe("WAZE_FUTURE");
    expect(result.legs).toEqual([]);
  });
});

describe("Request hash stability", () => {
  it("disabled provider hash is deterministic", async () => {
    const p = new DisabledRouteProvider();
    const r1 = await p.estimate(baseRequest);
    const r2 = await p.estimate(baseRequest);
    expect(r1.providerRequestHash).toBe(r2.providerRequestHash);
  });
});
