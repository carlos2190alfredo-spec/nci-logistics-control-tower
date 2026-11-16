import type { Prisma } from "@/generated/prisma";
import { getDb } from "@/lib/server/db";
import { paginatedResult, type PaginationParams } from "@/lib/pagination";

export type FleetStatusFilter = "activos" | "inactivos" | "todos";

export function parseFleetStatus(value: string | undefined): FleetStatusFilter {
  return value === "inactivos" || value === "todos" ? value : "activos";
}

function statusWhere(status: FleetStatusFilter): { status?: string | { not: string } } {
  if (status === "activos") return { status: { not: "INACTIVE" } };
  if (status === "inactivos") return { status: "INACTIVE" };
  return {};
}

export async function listVehicles(tenantId: string, pg: PaginationParams, status: FleetStatusFilter) {
  const where: Prisma.VehicleWhereInput = { tenantId, ...statusWhere(status) };
  if (pg.search) {
    where.OR = [
      { plate: { contains: pg.search, mode: "insensitive" } },
      { code: { contains: pg.search, mode: "insensitive" } },
      { type: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  const db = getDb();
  const [items, total] = await Promise.all([
    db.vehicle.findMany({ where, orderBy: { plate: "asc" }, skip: pg.skip, take: pg.take }),
    db.vehicle.count({ where }),
  ]);
  return paginatedResult(items, total, pg);
}

export async function listEquipment(tenantId: string, pg: PaginationParams, status: FleetStatusFilter) {
  const where: Prisma.EquipmentWhereInput = { tenantId, ...statusWhere(status) };
  if (pg.search) {
    where.OR = [
      { code: { contains: pg.search, mode: "insensitive" } },
      { type: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  const db = getDb();
  const [items, total] = await Promise.all([
    db.equipment.findMany({ where, orderBy: { code: "asc" }, skip: pg.skip, take: pg.take }),
    db.equipment.count({ where }),
  ]);
  return paginatedResult(items, total, pg);
}

/** Conteos de las pestañas (activos = no inactivos). */
export async function countFleet(tenantId: string) {
  const db = getDb();
  const [vehicles, equipment] = await Promise.all([
    db.vehicle.count({ where: { tenantId, status: { not: "INACTIVE" } } }),
    db.equipment.count({ where: { tenantId, status: { not: "INACTIVE" } } }),
  ]);
  return { vehicles, equipment };
}
