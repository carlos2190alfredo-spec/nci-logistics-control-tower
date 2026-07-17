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
  route: string;
  summary: ProfitabilitySummary;
};

export type GroupProfitability = {
  key: string;
  label: string;
  count: number;
  summary: ProfitabilitySummary;
};

export type TenantProfitability = {
  total: ProfitabilitySummary;
  trips: TripProfitability[];
  byClient: GroupProfitability[];
  byRoute: GroupProfitability[];
};

function groupBy(
  trips: TripProfitability[],
  keyOf: (t: TripProfitability) => { key: string; label: string },
): GroupProfitability[] {
  const groups = new Map<string, { label: string; items: TripProfitability[] }>();
  for (const t of trips) {
    const { key, label } = keyOf(t);
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(t);
    groups.set(key, g);
  }
  const out: GroupProfitability[] = [];
  for (const [key, g] of groups) {
    out.push({
      key,
      label: g.label,
      count: g.items.length,
      summary: aggregateProfitability(g.items.map((i) => i.summary)),
    });
  }
  out.sort((a, b) => b.summary.margin - a.summary.margin);
  return out;
}

/**
 * Rentabilidad del tenant: agrega las líneas financieras por viaje y calcula
 * total, por cliente y por ruta, de forma determinista (montos del tenant).
 */
export async function getTenantProfitability(tenantId: string): Promise<TenantProfitability> {
  const entries = await getDb().tripFinancialEntry.findMany({
    where: { tenantId },
    include: {
      trip: {
        select: {
          reference: true,
          origin: true,
          destination: true,
          customerAccount: { select: { name: true } },
        },
      },
    },
    take: 10000,
  });

  const byTrip = new Map<
    string,
    { reference: string; customerName: string; route: string; lines: typeof entries }
  >();
  for (const e of entries) {
    const cur = byTrip.get(e.tripId) ?? {
      reference: e.trip.reference,
      customerName: e.trip.customerAccount?.name ?? "",
      route: `${e.trip.origin} → ${e.trip.destination}`,
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
    trips.push({ tripId, reference: data.reference, customerName: data.customerName, route: data.route, summary });
  }

  trips.sort((a, b) => b.summary.margin - a.summary.margin);
  const total = aggregateProfitability(trips.map((t) => t.summary));
  const byClient = groupBy(trips, (t) => ({ key: t.customerName || "—", label: t.customerName || "Sin cliente" }));
  const byRoute = groupBy(trips, (t) => ({ key: t.route, label: t.route }));

  return { total, trips, byClient, byRoute };
}
