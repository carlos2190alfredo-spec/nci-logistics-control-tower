import { describe, expect, it } from "vitest";
import { hasActiveException, isExceptionActive, type ExceptionLite } from "./exceptions";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

const ex = (over: Partial<ExceptionLite>): ExceptionLite => ({
  gate: "COMPLIANCE",
  scope: "TRIP",
  targetKey: "trip-1",
  ...over,
});

describe("isExceptionActive", () => {
  it("sin expiracion ni revocacion => activa", () => {
    expect(isExceptionActive(ex({}), NOW)).toBe(true);
  });
  it("revocada => inactiva", () => {
    expect(isExceptionActive(ex({ revokedAt: inDays(-1) }), NOW)).toBe(false);
  });
  it("expiracion pasada => inactiva", () => {
    expect(isExceptionActive(ex({ expiresAt: inDays(-1) }), NOW)).toBe(false);
  });
  it("expiracion futura => activa", () => {
    expect(isExceptionActive(ex({ expiresAt: inDays(1) }), NOW)).toBe(true);
  });
});

describe("hasActiveException", () => {
  const args = { tripId: "trip-1", assetKeys: ["VEHICULO:VH-1", "EQUIPO:EQ-2", "CONDUCTOR:DR-1"] };

  it("scope=TRIP matchea el viaje", () => {
    expect(hasActiveException([ex({})], "COMPLIANCE", args, NOW)).toBe(true);
  });
  it("scope=TRIP con otro viaje NO matchea", () => {
    expect(hasActiveException([ex({ targetKey: "trip-otro" })], "COMPLIANCE", args, NOW)).toBe(false);
  });
  it("scope=ASSET matchea por clave de activo", () => {
    const e = ex({ scope: "ASSET", targetKey: "VEHICULO:VH-1" });
    expect(hasActiveException([e], "COMPLIANCE", args, NOW)).toBe(true);
  });
  it("scope=ASSET con codigo distinto NO matchea", () => {
    const e = ex({ scope: "ASSET", targetKey: "VEHICULO:VH-9" });
    expect(hasActiveException([e], "COMPLIANCE", args, NOW)).toBe(false);
  });
  it("gate distinto NO matchea", () => {
    expect(hasActiveException([ex({})], "MAINTENANCE", args, NOW)).toBe(false);
  });
  it("excepcion revocada NO cuenta", () => {
    expect(hasActiveException([ex({ revokedAt: inDays(-1) })], "COMPLIANCE", args, NOW)).toBe(false);
  });
  it("excepcion expirada NO cuenta", () => {
    expect(hasActiveException([ex({ expiresAt: inDays(-1) })], "COMPLIANCE", args, NOW)).toBe(false);
  });
  it("lista vacia => sin excepcion", () => {
    expect(hasActiveException([], "COMPLIANCE", args, NOW)).toBe(false);
  });
});
