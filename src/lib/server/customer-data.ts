import type { Prisma } from "@/generated/prisma";
import { getDb } from "@/lib/server/db";
import { paginatedResult, type PaginationParams } from "@/lib/pagination";

export type CustomerStatusFilter = "activos" | "inactivos" | "todos";

export function parseCustomerStatus(value: string | undefined): CustomerStatusFilter {
  return value === "inactivos" || value === "todos" ? value : "activos";
}

/** Lista paginada de clientes del tenant con el numero de usuarios del portal activos (sin N+1). */
export async function listCustomers(tenantId: string, pg: PaginationParams, status: CustomerStatusFilter) {
  const db = getDb();
  const where: Prisma.CustomerAccountWhereInput = { tenantId };
  if (status === "activos") where.active = true;
  if (status === "inactivos") where.active = false;
  if (pg.search) {
    where.OR = [
      { name: { contains: pg.search, mode: "insensitive" } },
      { code: { contains: pg.search, mode: "insensitive" } },
      { taxId: { contains: pg.search, mode: "insensitive" } },
      { contactName: { contains: pg.search, mode: "insensitive" } },
      { contactEmail: { contains: pg.search, mode: "insensitive" } },
    ];
  }
  const [customers, total] = await Promise.all([
    db.customerAccount.findMany({ where, orderBy: { name: "asc" }, skip: pg.skip, take: pg.take }),
    db.customerAccount.count({ where }),
  ]);
  const counts = customers.length
    ? await db.customerMembership.groupBy({
        by: ["customerAccountId"],
        where: { tenantId, active: true, customerAccountId: { in: customers.map((customer) => customer.id) } },
        _count: { _all: true },
      })
    : [];
  const portalUsers = new Map(counts.map((row) => [row.customerAccountId, row._count._all]));
  return paginatedResult(
    customers.map((customer) => ({ ...customer, portalUsers: portalUsers.get(customer.id) ?? 0 })),
    total,
    pg,
  );
}
