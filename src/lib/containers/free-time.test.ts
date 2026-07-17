import { describe, expect, it } from "vitest";
import { computeFreeTime, fullDaysBetween } from "./free-time";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

describe("container free-time / demurrage", () => {
  it("sin inicio => sin transcurso, sin riesgo", () => {
    const r = computeFreeTime({ startAt: null, freeDays: 5, ratePerDay: 100, now: NOW });
    expect(r.elapsedDays).toBe(0);
    expect(r.freeDaysRemaining).toBe(5);
    expect(r.amount).toBe(0);
    expect(r.risk).toBe("SIN_RIESGO");
  });

  it("inicio futuro => sin transcurso", () => {
    const r = computeFreeTime({ startAt: daysAhead(2), freeDays: 5, ratePerDay: 100, now: NOW });
    expect(r.elapsedDays).toBe(0);
    expect(r.risk).toBe("SIN_RIESGO");
  });

  it("dentro de días libres con margen => SIN_RIESGO", () => {
    const r = computeFreeTime({ startAt: daysAgo(1), freeDays: 5, ratePerDay: 100, now: NOW });
    expect(r.elapsedDays).toBe(1);
    expect(r.freeDaysConsumed).toBe(1);
    expect(r.freeDaysRemaining).toBe(4);
    expect(r.chargeableDays).toBe(0);
    expect(r.amount).toBe(0);
    expect(r.risk).toBe("SIN_RIESGO");
  });

  it("quedan 3 días libres => RIESGO_PROXIMO", () => {
    const r = computeFreeTime({ startAt: daysAgo(2), freeDays: 5, ratePerDay: 100, now: NOW });
    expect(r.freeDaysRemaining).toBe(3);
    expect(r.risk).toBe("RIESGO_PROXIMO");
  });

  it("queda 1 día libre => RIESGO_ALTO", () => {
    const r = computeFreeTime({ startAt: daysAgo(4), freeDays: 5, ratePerDay: 100, now: NOW });
    expect(r.freeDaysRemaining).toBe(1);
    expect(r.risk).toBe("RIESGO_ALTO");
  });

  it("excedido => CARGO_ACUMULANDOSE con monto correcto", () => {
    const r = computeFreeTime({ startAt: daysAgo(8), freeDays: 5, ratePerDay: 75, now: NOW });
    expect(r.elapsedDays).toBe(8);
    expect(r.freeDaysConsumed).toBe(5);
    expect(r.freeDaysRemaining).toBe(0);
    expect(r.chargeableDays).toBe(3);
    expect(r.amount).toBe(225);
    expect(r.risk).toBe("CARGO_ACUMULANDOSE");
  });

  it("con endAt => CARGO_CERRADO y cuenta hasta esa fecha", () => {
    const r = computeFreeTime({
      startAt: daysAgo(10),
      endAt: daysAgo(3),
      freeDays: 5,
      ratePerDay: 50,
      now: NOW,
    });
    expect(r.elapsedDays).toBe(7);
    expect(r.chargeableDays).toBe(2);
    expect(r.amount).toBe(100);
    expect(r.risk).toBe("CARGO_CERRADO");
  });

  it("sin tarifa => amount null", () => {
    const r = computeFreeTime({ startAt: daysAgo(8), freeDays: 5, ratePerDay: null, now: NOW });
    expect(r.chargeableDays).toBe(3);
    expect(r.amount).toBeNull();
  });

  it("redondea el monto a 2 decimales", () => {
    const r = computeFreeTime({ startAt: daysAgo(7), freeDays: 5, ratePerDay: 33.333, now: NOW });
    expect(r.chargeableDays).toBe(2);
    expect(r.amount).toBe(66.67);
  });

  it("fullDaysBetween nunca es negativo", () => {
    expect(fullDaysBetween(daysAhead(2), NOW)).toBe(0);
    expect(fullDaysBetween(daysAgo(3), NOW)).toBe(3);
  });
});
