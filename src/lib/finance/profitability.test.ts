import { describe, expect, it } from "vitest";
import { aggregateProfitability, summarizeProfitability, type FinancialLine } from "./profitability";

const line = (over: Partial<FinancialLine>): FinancialLine => ({
  kind: "INGRESO",
  category: "TARIFA_BASE",
  amount: 0,
  ...over,
});

describe("profitability", () => {
  it("suma ingresos y costos y calcula margen", () => {
    const r = summarizeProfitability([
      line({ kind: "INGRESO", category: "TARIFA_BASE", amount: 1000 }),
      line({ kind: "INGRESO", category: "RECARGO", amount: 200 }),
      line({ kind: "COSTO", category: "COMBUSTIBLE", amount: 300 }),
      line({ kind: "COSTO", category: "PEAJE", amount: 100 }),
    ]);
    expect(r.revenue).toBe(1200);
    expect(r.cost).toBe(400);
    expect(r.margin).toBe(800);
    expect(r.marginPct).toBeCloseTo(66.7, 1);
  });

  it("desglosa por categoría", () => {
    const r = summarizeProfitability([
      line({ kind: "COSTO", category: "COMBUSTIBLE", amount: 100 }),
      line({ kind: "COSTO", category: "COMBUSTIBLE", amount: 50 }),
    ]);
    expect(r.byCategory.COMBUSTIBLE).toBe(150);
  });

  it("separa ingreso facturable de no facturable", () => {
    const r = summarizeProfitability([
      line({ kind: "INGRESO", category: "TARIFA_BASE", amount: 500, billable: true }),
      line({ kind: "INGRESO", category: "REEMBOLSABLE", amount: 100, billable: false }),
    ]);
    expect(r.revenue).toBe(600);
    expect(r.billableRevenue).toBe(500);
  });

  it("margen -100% cuando solo hay costos", () => {
    const r = summarizeProfitability([line({ kind: "COSTO", category: "OTRO", amount: 250 })]);
    expect(r.revenue).toBe(0);
    expect(r.marginPct).toBe(-100);
  });

  it("sin líneas => todo cero", () => {
    const r = summarizeProfitability([]);
    expect(r).toMatchObject({ revenue: 0, cost: 0, margin: 0, marginPct: 0 });
  });

  it("redondea a 2 decimales", () => {
    const r = summarizeProfitability([
      line({ kind: "INGRESO", category: "TARIFA_BASE", amount: 33.333 }),
      line({ kind: "INGRESO", category: "RECARGO", amount: 33.333 }),
    ]);
    expect(r.revenue).toBe(66.67);
  });

  it("aggregateProfitability suma varios servicios", () => {
    const a = summarizeProfitability([line({ kind: "INGRESO", category: "TARIFA_BASE", amount: 1000 }), line({ kind: "COSTO", category: "COMBUSTIBLE", amount: 400 })]);
    const b = summarizeProfitability([line({ kind: "INGRESO", category: "TARIFA_BASE", amount: 500 }), line({ kind: "COSTO", category: "PEAJE", amount: 100 })]);
    const total = aggregateProfitability([a, b]);
    expect(total.revenue).toBe(1500);
    expect(total.cost).toBe(500);
    expect(total.margin).toBe(1000);
    expect(total.byCategory.COMBUSTIBLE).toBe(400);
  });
});
