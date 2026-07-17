import { getDb } from "@/lib/server/db";
import type { HazmatShipment } from "@/generated/prisma";

export async function getHazmatShipments(tenantId: string): Promise<HazmatShipment[]> {
  return getDb().hazmatShipment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function getHazmatShipment(tenantId: string, id: string) {
  return getDb().hazmatShipment.findFirst({ where: { id, tenantId } });
}

export type HazmatCounts = {
  total: number;
  active: number;
  blocked: number;
  needsReview: number;
};

export function summarizeHazmat(rows: HazmatShipment[]): HazmatCounts {
  let active = 0;
  let blocked = 0;
  let needsReview = 0;
  for (const s of rows) {
    if (s.status !== "EXPEDIENTE_CERRADO" && s.status !== "CANCELADA") active += 1;
    if (s.complianceState === "NO_CUMPLE") blocked += 1;
    if (s.complianceState === "NO_VERIFICADO" || s.complianceState === "REQUIERE_APROBACION") {
      needsReview += 1;
    }
  }
  return { total: rows.length, active, blocked, needsReview };
}
