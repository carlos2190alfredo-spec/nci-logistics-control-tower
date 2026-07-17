import { describe, expect, it } from "vitest";
import { assetAssignable, summarizeAssetMaintenance, type MaintenanceOrderLite } from "./maintenance";

const o = (over: Partial<MaintenanceOrderLite>): MaintenanceOrderLite => ({
  status: "PROGRAMADO",
  blocksAsset: true,
  ...over,
});

describe("fleet maintenance", () => {
  it("sin órdenes => asignable", () => {
    expect(assetAssignable([])).toBe(true);
    expect(summarizeAssetMaintenance([]).blocked).toBe(false);
  });

  it("orden abierta bloqueante => bloqueado", () => {
    const s = summarizeAssetMaintenance([o({ status: "EN_PROGRESO", blocksAsset: true })]);
    expect(s.blocked).toBe(true);
    expect(s.openOrders).toBe(1);
    expect(assetAssignable([o({ status: "EN_PROGRESO" })])).toBe(false);
  });

  it("orden abierta no bloqueante => no bloquea pero cuenta", () => {
    const s = summarizeAssetMaintenance([o({ status: "PROGRAMADO", blocksAsset: false })]);
    expect(s.blocked).toBe(false);
    expect(s.openOrders).toBe(1);
  });

  it("orden completada no bloquea", () => {
    expect(assetAssignable([o({ status: "COMPLETADO" })])).toBe(true);
    expect(assetAssignable([o({ status: "CANCELADO" })])).toBe(true);
  });

  it("elige la próxima intervención más cercana", () => {
    const near = new Date("2026-08-01");
    const far = new Date("2026-12-01");
    const s = summarizeAssetMaintenance([
      o({ status: "PROGRAMADO", nextServiceAt: far }),
      o({ status: "PROGRAMADO", nextServiceAt: near }),
    ]);
    expect(s.nextServiceAt).toEqual(near);
  });

  it("elige el menor next km", () => {
    const s = summarizeAssetMaintenance([
      o({ status: "PROGRAMADO", nextServiceKm: 90000 }),
      o({ status: "PROGRAMADO", nextServiceKm: 80000 }),
    ]);
    expect(s.nextServiceKm).toBe(80000);
  });
});
