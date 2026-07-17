import type { FinancialEntryKind, FinancialCategory } from "@/generated/prisma";

/**
 * Cálculo determinista de rentabilidad por servicio.
 * PURO: sin base de datos ni IA. Suma líneas financieras verificadas
 * (montos son datos del tenant) y deriva márgenes e indicadores.
 */

export type FinancialLine = {
  kind: FinancialEntryKind;
  category: FinancialCategory;
  amount: number;
  billable?: boolean;
};

export type ProfitabilitySummary = {
  revenue: number;
  cost: number;
  margin: number;
  /** Margen porcentual sobre ingresos, redondeado a 1 decimal. */
  marginPct: number;
  billableRevenue: number;
  byCategory: Partial<Record<FinancialCategory, number>>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarizeProfitability(lines: FinancialLine[]): ProfitabilitySummary {
  let revenue = 0;
  let cost = 0;
  let billableRevenue = 0;
  const byCategory: Partial<Record<FinancialCategory, number>> = {};

  for (const line of lines) {
    const amount = Number.isFinite(line.amount) ? line.amount : 0;
    byCategory[line.category] = round2((byCategory[line.category] ?? 0) + amount);
    if (line.kind === "INGRESO") {
      revenue += amount;
      if (line.billable !== false) billableRevenue += amount;
    } else {
      cost += amount;
    }
  }

  revenue = round2(revenue);
  cost = round2(cost);
  const margin = round2(revenue - cost);
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : cost > 0 ? -100 : 0;

  return { revenue, cost, margin, marginPct, billableRevenue: round2(billableRevenue), byCategory };
}

/** Agrega varios servicios (p.ej. por cliente o ruta) en un total. */
export function aggregateProfitability(summaries: ProfitabilitySummary[]): ProfitabilitySummary {
  const revenue = round2(summaries.reduce((s, x) => s + x.revenue, 0));
  const cost = round2(summaries.reduce((s, x) => s + x.cost, 0));
  const billableRevenue = round2(summaries.reduce((s, x) => s + x.billableRevenue, 0));
  const margin = round2(revenue - cost);
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : cost > 0 ? -100 : 0;
  const byCategory: Partial<Record<FinancialCategory, number>> = {};
  for (const s of summaries) {
    for (const [cat, val] of Object.entries(s.byCategory) as [FinancialCategory, number][]) {
      byCategory[cat] = round2((byCategory[cat] ?? 0) + val);
    }
  }
  return { revenue, cost, margin, marginPct, billableRevenue, byCategory };
}
