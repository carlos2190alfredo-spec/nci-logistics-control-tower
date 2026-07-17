import { getDb } from "@/lib/server/db";
import { summarizeAssetMaintenance } from "@/lib/fleet/maintenance";
import type { MaintenanceOrder } from "@/generated/prisma";

export async function getMaintenanceOrders(tenantId: string): Promise<MaintenanceOrder[]> {
  return getDb().maintenanceOrder.findMany({
    where: { tenantId },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
}

export type MaintenanceCounts = {
  total: number;
  open: number;
  blockedAssets: number;
};

/** Métricas + activos bloqueados (por código) a partir de órdenes abiertas. */
export function summarizeMaintenance(orders: MaintenanceOrder[]): MaintenanceCounts {
  const byAsset = new Map<string, MaintenanceOrder[]>();
  let open = 0;
  for (const o of orders) {
    if (o.status === "PROGRAMADO" || o.status === "EN_PROGRESO") open += 1;
    const key = `${o.assetType}:${o.assetCode}`;
    const arr = byAsset.get(key) ?? [];
    arr.push(o);
    byAsset.set(key, arr);
  }
  let blockedAssets = 0;
  for (const arr of byAsset.values()) {
    if (summarizeAssetMaintenance(arr).blocked) blockedAssets += 1;
  }
  return { total: orders.length, open, blockedAssets };
}

/** Mapa assetType:assetCode → bloqueado, para usar en asignaciones/elegibilidad. */
export async function getBlockedAssets(tenantId: string): Promise<Set<string>> {
  const orders = await getDb().maintenanceOrder.findMany({
    where: { tenantId, status: { in: ["PROGRAMADO", "EN_PROGRESO"] }, blocksAsset: true },
    select: { assetType: true, assetCode: true },
  });
  return new Set(orders.map((o) => `${o.assetType}:${o.assetCode}`));
}
