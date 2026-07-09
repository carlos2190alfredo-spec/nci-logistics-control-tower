import { describe, expect, it, vi } from "vitest";
import { getDeterministicProgress, interpolateRoute } from "@/lib/domain/gps";

describe("demo gps provider", () => {
  it("calculates deterministic progress from start time", () => {
    vi.setSystemTime(new Date("2026-07-09T12:10:00Z"));
    const progress = getDeterministicProgress({
      startedAt: new Date("2026-07-09T12:00:00Z"),
      pausedAt: null,
      storedProgress: 0,
      expectedDuration: 1200,
    });
    expect(progress).toBe(0.5);
    vi.useRealTimers();
  });

  it("interpolates route coordinates", () => {
    const point = interpolateRoute(
      [
        { label: "A", lat: 0, lng: 0 },
        { label: "B", lat: 10, lng: 10 },
      ],
      0.25,
    );
    expect(point).toEqual({ label: "B", lat: 2.5, lng: 2.5 });
  });
});
