import { describe, expect, it } from "vitest";
import { isSupportActive, minutesRemaining, type SupportSessionLite } from "./session";

const NOW = new Date("2026-07-21T12:00:00.000Z");
const inMin = (m: number) => new Date(NOW.getTime() + m * 60_000);

const s = (over: Partial<SupportSessionLite>): SupportSessionLite => ({
  startedAt: inMin(-10),
  endedAt: null,
  expiresAt: null,
  ...over,
});

describe("support session", () => {
  it("sin expiracion ni cierre => activa", () => {
    expect(isSupportActive(s({}), NOW)).toBe(true);
  });
  it("cerrada => inactiva", () => {
    expect(isSupportActive(s({ endedAt: inMin(-1) }), NOW)).toBe(false);
  });
  it("expiracion pasada => inactiva", () => {
    expect(isSupportActive(s({ expiresAt: inMin(-1) }), NOW)).toBe(false);
  });
  it("expiracion futura => activa", () => {
    expect(isSupportActive(s({ expiresAt: inMin(30) }), NOW)).toBe(true);
  });
  it("minutosRestantes 0 si no hay expiracion", () => {
    expect(minutesRemaining(s({}), NOW)).toBe(0);
  });
  it("minutosRestantes cuenta hacia arriba", () => {
    expect(minutesRemaining(s({ expiresAt: inMin(45) }), NOW)).toBe(45);
  });
  it("minutosRestantes 0 si sesion cerrada", () => {
    expect(minutesRemaining(s({ endedAt: inMin(-1), expiresAt: inMin(45) }), NOW)).toBe(0);
  });
});
