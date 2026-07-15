import { describe, it, expect } from "vitest";
import { recommendDriverForTrip } from "./driver-recommendation";
import type { RecommendationInput, DriverCandidate, DriverWorkScheduleEntry } from "./driver-recommendation";
import type { DayOfWeek } from "@/generated/prisma";

const DAY_MAP: Record<number, DayOfWeek> = {
  0: "SUNDAY", 1: "MONDAY", 2: "TUESDAY", 3: "WEDNESDAY",
  4: "THURSDAY", 5: "FRIDAY", 6: "SATURDAY",
};

const tenantId = "tenant-1";
const tripId = "trip-1";

function makeDriver(overrides: Partial<DriverCandidate> = {}): DriverCandidate {
  return {
    id: "driver-1",
    name: "Juan Perez",
    code: "JP-001",
    status: "AVAILABLE",
    tenantId,
    ...overrides,
  };
}

function makeSchedule(driverId: string, day: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" = "MONDAY"): DriverWorkScheduleEntry {
  return {
    driverId,
    dayOfWeek: day,
    startTimeLocal: "06:00",
    endTimeLocal: "18:00",
    isActive: true,
  };
}

function makeInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    tenantId,
    tripId,
    plannedStartAt: new Date("2026-07-13T10:00:00Z"), // Sunday
    drivers: [makeDriver()],
    workSchedules: [],
    availabilityExceptions: [],
    assignedTrips: [],
    driverStats: [],
    ...overrides,
  };
}

describe("recommendDriverForTrip", () => {
  it("returns no recommendation when no drivers", () => {
    const result = recommendDriverForTrip(makeInput({ drivers: [] }));
    expect(result.recommended).toBeNull();
    expect(result.riskLevel).toBe("HIGH");
    expect(result.explanation).toContain("No hay conductores");
  });

  it("recommends the only available driver", () => {
    const result = recommendDriverForTrip(makeInput());
    expect(result.recommended).not.toBeNull();
    expect(result.recommended?.driverId).toBe("driver-1");
  });

  it("scores higher for driver within work schedule", () => {
    const mondayTrip = new Date("2026-07-14T12:00:00Z");
    const day = DAY_MAP[mondayTrip.getDay()];
    const input = makeInput({
      plannedStartAt: mondayTrip,
      drivers: [
        makeDriver({ id: "d1", name: "Con horario", code: "D1" }),
        makeDriver({ id: "d2", name: "Sin horario", code: "D2" }),
      ],
      workSchedules: [makeSchedule("d1", day as "MONDAY")],
    });
    const result = recommendDriverForTrip(input);
    expect(result.recommended?.driverId).toBe("d1");
    const d2Score = result.alternatives.find((a) => a.driverId === "d2")?.score ?? -Infinity;
    expect(result.recommended!.score).toBeGreaterThan(d2Score);
  });

  it("disqualifies inactive driver", () => {
    const result = recommendDriverForTrip(makeInput({
      drivers: [makeDriver({ status: "OFF_DUTY" })],
    }));
    expect(result.disqualified.length).toBe(1);
    expect(result.disqualified[0].disqualificationReason).toContain("inactivo");
  });

  it("disqualifies driver with trip conflict", () => {
    const start = new Date("2026-07-13T10:00:00Z");
    const result = recommendDriverForTrip(makeInput({
      plannedStartAt: start,
      assignedTrips: [{
        tripId: "other-trip",
        driverId: "driver-1",
        scheduledAt: new Date(start.getTime() - 1800_000),
        estimatedEndAt: new Date(start.getTime() + 1800_000),
        status: "IN_TRANSIT",
      }],
    }));
    expect(result.disqualified.length).toBe(1);
    expect(result.disqualified[0].warnings.some((w) => w.includes("Solapamiento"))).toBe(true);
    expect(result.disqualified[0].disqualificationReason).toContain("Conflicto");
  });

  it("disqualifies driver on vacation", () => {
    const tripDate = new Date("2026-07-13T10:00:00Z");
    const result = recommendDriverForTrip(makeInput({
      plannedStartAt: tripDate,
      availabilityExceptions: [{
        driverId: "driver-1",
        date: tripDate,
        type: "VACATION",
      }],
    }));
    expect(result.disqualified.length).toBe(1);
    expect(result.disqualified[0].disqualificationReason).toContain("Vacaciones");
  });

  it("scores extra shift positively", () => {
    const tripDate = new Date("2026-07-13T10:00:00Z");
    const result = recommendDriverForTrip(makeInput({
      plannedStartAt: tripDate,
      availabilityExceptions: [{
        driverId: "driver-1",
        date: tripDate,
        type: "EXTRA_SHIFT",
      }],
    }));
    expect(result.recommended?.reasons.some((r) => r.includes("Turno extra"))).toBe(true);
  });

  it("does not cross tenants", () => {
    const result = recommendDriverForTrip(makeInput({
      drivers: [makeDriver({ tenantId: "other-tenant" })],
    }));
    expect(result.recommended).toBeNull();
    expect(result.explanation).toContain("No hay conductores");
  });

  it("ranks drivers by score descending", () => {
    const input = makeInput({
      drivers: [
        makeDriver({ id: "d1", name: "A", code: "A" }),
        makeDriver({ id: "d2", name: "B", code: "B" }),
        makeDriver({ id: "d3", name: "C", code: "C" }),
      ],
      driverStats: [
        { driverId: "d1", incidentsLast30d: 5, tripsToday: 4, lastPwaSyncAt: null },
        { driverId: "d2", incidentsLast30d: 0, tripsToday: 0, lastPwaSyncAt: new Date() },
        { driverId: "d3", incidentsLast30d: 1, tripsToday: 2, lastPwaSyncAt: null },
      ],
    });
    const result = recommendDriverForTrip(input);
    const allScored = [result.recommended, ...result.alternatives, ...result.disqualified].filter(Boolean);
    for (let i = 1; i < allScored.length; i++) {
      expect(allScored[i - 1]!.score).toBeGreaterThanOrEqual(allScored[i]!.score);
    }
  });

  it("returns LOW risk for confident recommendation", () => {
    const mondayTrip = new Date("2026-07-14T10:00:00Z"); // Monday
    const result = recommendDriverForTrip(makeInput({
      plannedStartAt: mondayTrip,
      workSchedules: [makeSchedule("driver-1", "MONDAY")],
      driverStats: [{ driverId: "driver-1", incidentsLast30d: 0, tripsToday: 0, lastPwaSyncAt: new Date() }],
    }));
    expect(result.riskLevel).toBe("LOW");
  });

  it("returns HIGH risk when no eligible drivers", () => {
    const result = recommendDriverForTrip(makeInput({
      drivers: [makeDriver({ status: "INACTIVE" })],
    }));
    expect(result.riskLevel).toBe("HIGH");
  });

  it("penalizes driver with many incidents", () => {
    const input = makeInput({
      driverStats: [{ driverId: "driver-1", incidentsLast30d: 5, tripsToday: 0, lastPwaSyncAt: null }],
    });
    const result = recommendDriverForTrip(input);
    expect(result.recommended?.warnings.some((w) => w.includes("incidencias"))).toBe(true);
  });

  it("rewards recent PWA sync", () => {
    const input = makeInput({
      driverStats: [{ driverId: "driver-1", incidentsLast30d: 0, tripsToday: 0, lastPwaSyncAt: new Date() }],
    });
    const result = recommendDriverForTrip(input);
    expect(result.recommended?.reasons.some((r) => r.includes("PWA sincronizada"))).toBe(true);
  });

  it("generates explanation text", () => {
    const result = recommendDriverForTrip(makeInput());
    expect(result.explanation.length).toBeGreaterThan(10);
    expect(result.generatedBy).toBe("RULES_ENGINE");
  });
});
