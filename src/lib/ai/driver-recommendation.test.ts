import { describe, it, expect } from "vitest";
import { recommendDriverForTrip } from "./driver-recommendation";
import type { RecommendationInput, DriverCandidate, DriverWorkScheduleEntry } from "./driver-recommendation";
import type { DayOfWeek } from "@/generated/prisma";

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
    plannedStartAt: new Date("2026-07-13T10:00:00Z"), // lunes 13 de julio, 05:00 en Panamá
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
    // Martes 14 de julio, 07:00 en Panamá (dentro de 06:00-18:00). El día se fija aquí: no depende de la zona del equipo.
    const tuesdayTrip = new Date("2026-07-14T12:00:00Z");
    const input = makeInput({
      plannedStartAt: tuesdayTrip,
      drivers: [
        makeDriver({ id: "d1", name: "Con horario", code: "D1" }),
        makeDriver({ id: "d2", name: "Sin horario", code: "D2" }),
      ],
      workSchedules: [makeSchedule("d1", "TUESDAY")],
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
    const tuesdayTrip = new Date("2026-07-14T12:00:00Z"); // martes 07:00 en Panamá, dentro de 06:00-18:00
    const result = recommendDriverForTrip(makeInput({
      plannedStartAt: tuesdayTrip,
      workSchedules: [makeSchedule("driver-1", "TUESDAY")],
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

describe("hora del tenant (Panamá), no la del servidor", () => {
  // 2026-07-14T00:30:00Z = lunes 13 de julio, 19:30 en Panamá (UTC-5). En UTC ya sería martes 00:30.
  const mondayEveningPanama = new Date("2026-07-14T00:30:00.000Z");
  const schedule = (dayOfWeek: DayOfWeek, end = "20:00"): DriverWorkScheduleEntry => ({
    driverId: "driver-1",
    dayOfWeek,
    startTimeLocal: "06:00",
    endTimeLocal: end,
    isActive: true,
  });

  it("lee el día y la hora en Panamá: el horario del lunes aplica a las 19:30 del lunes", () => {
    const result = recommendDriverForTrip(makeInput({ plannedStartAt: mondayEveningPanama, workSchedules: [schedule("MONDAY")] }));
    expect(result.recommended?.reasons).toContain("Dentro de horario laboral");
    expect(result.recommended?.warnings).not.toContain("Sin horario configurado para este dia");
  });

  it("respeta el fin del turno en hora de Panamá (19:30 está fuera de un turno que termina a las 18:00)", () => {
    const result = recommendDriverForTrip(makeInput({ plannedStartAt: mondayEveningPanama, workSchedules: [schedule("MONDAY", "18:00")] }));
    expect(result.recommended?.warnings).toContain("Fuera de horario laboral");
  });

  it("el horario del martes NO aplica a la noche del lunes de Panamá", () => {
    const result = recommendDriverForTrip(makeInput({ plannedStartAt: mondayEveningPanama, workSchedules: [schedule("TUESDAY")] }));
    expect(result.recommended?.warnings).toContain("Sin horario configurado para este dia");
  });

  it("la excepción (fecha calendario) se compara con la fecha de Panamá: una vacación del lunes 13 descalifica", () => {
    const monday = recommendDriverForTrip(
      makeInput({
        plannedStartAt: mondayEveningPanama,
        availabilityExceptions: [{ driverId: "driver-1", date: new Date("2026-07-13"), type: "VACATION" }],
      }),
    );
    expect(monday.disqualified).toHaveLength(1);
    expect(monday.disqualified[0].disqualificationReason).toContain("Vacaciones");

    // Una vacación del martes 14 (el día UTC del instante) no aplica a este viaje.
    const tuesday = recommendDriverForTrip(
      makeInput({
        plannedStartAt: mondayEveningPanama,
        availabilityExceptions: [{ driverId: "driver-1", date: new Date("2026-07-14"), type: "VACATION" }],
      }),
    );
    expect(tuesday.disqualified).toHaveLength(0);
  });

  it("con una zona explícita distinta el resultado cambia (la zona sale del dato, no del servidor)", () => {
    const result = recommendDriverForTrip(
      makeInput({ plannedStartAt: mondayEveningPanama, timeZone: "UTC", workSchedules: [schedule("TUESDAY")] }),
    );
    // En UTC es martes 00:30: SÍ hay horario ese día (se encuentra) y 00:30 queda fuera de 06:00-20:00.
    expect(result.recommended?.warnings).toContain("Fuera de horario laboral");
    expect(result.recommended?.warnings).not.toContain("Sin horario configurado para este dia");
  });
});
