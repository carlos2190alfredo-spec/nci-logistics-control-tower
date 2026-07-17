import { getDb } from "@/lib/server/db";
import {
  aggregateProfitability,
  summarizeProfitability,
  type ProfitabilitySummary,
} from "@/lib/finance/profitability";

export type TripProfitability = {
  tripId: string;
  reference: string;
  customerName: string;
  summary: ProfitabilitySummary;
};

export type TenantProfitability = {
  total: ProfitabilitySummary;
  trips: TripProfitability[];
};

/**
 * Rentabilidad del tenant: agrega las líneas financieras por viaje y calcula
 * el total, de forma determinista (montos verificados del tenant).
 */
export async function getTenantProfitability(tenantId: string): Promise<TenantProfitability> {
  const entries = await getDb().tripFinancialEntry.findMany({
    where: { tenantId },
    include: { trip: { select: { reference: true, customerAccount: { select: { name: true } } } } },
    take: 10000,
  });

  const byTrip = new Map<string, { reference: string; customerName: string; lines: typeof entries }>();
  for (const e of entries) {
    const cur = byTrip.get(e.tripId) ?? {
      reference: e.trip.reference,
      customerName: e.trip.customerAccount?.name ?? "",
      lines: [] as typeof entries,
    };
    cur.lines.push(e);
    byTrip.set(e.tripId, cur);
  }

  const trips: TripProfitability[] = [];
  for (const [tripId, data] of byTrip) {
    const summary = summarizeProfitability(
      data.lines.map((l) => ({
        kind: l.kind,
        category: l.category,
        amount: Number(l.amount),
        billable: l.billable,
      })),
    );
    trips.push({ tripId, reference: data.reference, customerName: data.customerName, summary });
  }

  trips.sort((a, b) => b.summary.margin - a.summary.margin);
  const total = aggregateProfitability(trips.map((t) => t.summary));

  return { total, trips };
}
