import { describe, expect, it } from "vitest";
import {
  computeExpiry,
  daysBetween,
  documentBlocksNow,
  reconcileStatus,
} from "./expiry";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);
const ALERTS = [120, 90, 60, 30, 15, 7, 3];

describe("compliance expiry", () => {
  it("sin fecha de vencimiento => SIN_VENCIMIENTO", () => {
    const r = computeExpiry({ expiresAt: null, alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("SIN_VENCIMIENTO");
    expect(r.daysUntilExpiry).toBeNull();
  });

  it("fecha futura lejana => VIGENTE", () => {
    const r = computeExpiry({ expiresAt: inDays(200), alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("VIGENTE");
    expect(r.crossedThreshold).toBeNull();
    expect(r.daysUntilExpiry).toBe(200);
  });

  it("dentro de la ventana de 30 días => PROXIMO_A_VENCER con umbral 30", () => {
    const r = computeExpiry({ expiresAt: inDays(28), alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("PROXIMO_A_VENCER");
    expect(r.crossedThreshold).toBe(30);
  });

  it("elige el umbral más cercano cuando cruza varios", () => {
    const r = computeExpiry({ expiresAt: inDays(2), alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("PROXIMO_A_VENCER");
    expect(r.crossedThreshold).toBe(3);
  });

  it("fecha pasada => VENCIDO con días negativos", () => {
    const r = computeExpiry({ expiresAt: inDays(-5), alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("VENCIDO");
    expect(r.daysUntilExpiry).toBeLessThanOrEqual(0);
  });

  it("vence exactamente hoy => VENCIDO", () => {
    const r = computeExpiry({ expiresAt: NOW, alertDaysBefore: ALERTS, now: NOW });
    expect(r.derived).toBe("VENCIDO");
  });

  it("sin ventanas de alerta => nunca PROXIMO_A_VENCER", () => {
    const r = computeExpiry({ expiresAt: inDays(1), alertDaysBefore: [], now: NOW });
    expect(r.derived).toBe("VIGENTE");
  });

  it("daysBetween redondea hacia arriba", () => {
    expect(daysBetween(NOW, inDays(1))).toBe(1);
    expect(daysBetween(NOW, new Date(NOW.getTime() + 1000))).toBe(1);
  });

  describe("reconcileStatus", () => {
    it("respeta overrides manuales terminales", () => {
      expect(reconcileStatus("RECHAZADO", "VIGENTE")).toBe("RECHAZADO");
      expect(reconcileStatus("SUSPENDIDO", "VIGENTE")).toBe("SUSPENDIDO");
      expect(reconcileStatus("NO_APLICABLE", "VENCIDO")).toBe("NO_APLICABLE");
      expect(reconcileStatus("EN_REVISION", "VENCIDO")).toBe("EN_REVISION");
    });

    it("deriva por fechas cuando el estado guardado no es override", () => {
      expect(reconcileStatus("VIGENTE", "VENCIDO")).toBe("VENCIDO");
      expect(reconcileStatus("VIGENTE", "PROXIMO_A_VENCER")).toBe("PROXIMO_A_VENCER");
      expect(reconcileStatus("VENCIDO", "VIGENTE")).toBe("VIGENTE");
    });
  });

  describe("documentBlocksNow", () => {
    it("no bloquea si blocksDispatch es false", () => {
      expect(documentBlocksNow({ blocksDispatch: false, status: "VENCIDO" })).toBe(false);
    });
    it("bloquea documento vencido/suspendido/rechazado que marca bloqueo", () => {
      expect(documentBlocksNow({ blocksDispatch: true, status: "VENCIDO" })).toBe(true);
      expect(documentBlocksNow({ blocksDispatch: true, status: "SUSPENDIDO" })).toBe(true);
      expect(documentBlocksNow({ blocksDispatch: true, status: "RECHAZADO" })).toBe(true);
    });
    it("no bloquea documento vigente aunque marque bloqueo", () => {
      expect(documentBlocksNow({ blocksDispatch: true, status: "VIGENTE" })).toBe(false);
    });
  });
});
