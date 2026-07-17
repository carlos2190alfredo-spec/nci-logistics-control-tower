import type { MaintenanceStatus } from "@/generated/prisma";

/**
 * Estado de mantenimiento de un activo (vehículo/equipo) — DETERMINISTA.
 * Puro: sin base de datos ni IA. Un activo con una orden abierta que bloquea
 * NO puede asignarse a un viaje.
 */

export type MaintenanceOrderLite = {
  status: MaintenanceStatus;
  blocksAsset: boolean;
  nextServiceAt?: Date | null;
  nextServiceKm?: number | null;
};

export type AssetMaintenanceState = {
  blocked: boolean;
  openOrders: number;
  /** Próxima intervención por fecha (la más cercana), si hay. */
  nextServiceAt: Date | null;
  nextServiceKm: number | null;
};

const OPEN: ReadonlySet<MaintenanceStatus> = new Set(["PROGRAMADO", "EN_PROGRESO"]);

export function summarizeAssetMaintenance(orders: MaintenanceOrderLite[]): AssetMaintenanceState {
  let blocked = false;
  let openOrders = 0;
  let nextServiceAt: Date | null = null;
  let nextServiceKm: number | null = null;

  for (const o of orders) {
    if (!OPEN.has(o.status)) continue;
    openOrders += 1;
    if (o.blocksAsset) blocked = true;
    if (o.nextServiceAt && (!nextServiceAt || o.nextServiceAt < nextServiceAt)) {
      nextServiceAt = o.nextServiceAt;
    }
    if (o.nextServiceKm != null && (nextServiceKm == null || o.nextServiceKm < nextServiceKm)) {
      nextServiceKm = o.nextServiceKm;
    }
  }

  return { blocked, openOrders, nextServiceAt, nextServiceKm };
}

/** ¿Puede asignarse este activo? (no bloqueado por mantenimiento). */
export function assetAssignable(orders: MaintenanceOrderLite[]): boolean {
  return !summarizeAssetMaintenance(orders).blocked;
}
