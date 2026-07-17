import { getDb } from "@/lib/server/db";
import { computeFreeTime, type FreeTimeResult } from "@/lib/containers/free-time";
import type { Container } from "@/generated/prisma";

export type ContainerWithFreeTime = Container & { freeTime: FreeTimeResult | null };

/**
 * Fecha de inicio del conteo de tiempo libre relevante:
 * - Si ya hizo gate-out (contenedor en poder del transportista) → detention
 *   cuenta desde gate-out.
 * - En otro caso, si está disponible en terminal → demurrage/almacenaje cuenta
 *   desde la disponibilidad.
 */
function freeTimeStart(c: Container): Date | null {
  return c.gateOutAt ?? c.availableAt ?? null;
}

/** Lista los contenedores del tenant con su free-time calculado (determinista). */
export async function getContainers(
  tenantId: string,
  now: Date = new Date(),
): Promise<ContainerWithFreeTime[]> {
  const containers = await getDb().container.findMany({
    where: { tenantId },
    orderBy: [{ returnDeadline: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });

  return containers.map((c) => {
    const start = freeTimeStart(c);
    const freeTime =
      c.freeDays != null && start
        ? computeFreeTime({
            startAt: start,
            endAt: c.emptyReturnedAt ?? undefined,
            freeDays: c.freeDays,
            ratePerDay: null,
            now,
          })
        : null;
    return { ...c, freeTime };
  });
}

export type ContainerCounts = {
  total: number;
  active: number;
  atRisk: number;
  accruing: number;
};

/** Métricas de cabecera para el dashboard de contenedores. */
export function summarizeContainers(rows: ContainerWithFreeTime[]): ContainerCounts {
  let active = 0;
  let atRisk = 0;
  let accruing = 0;
  for (const c of rows) {
    if (c.status !== "EXPEDIENTE_CERRADO" && c.status !== "CANCELADO") active += 1;
    const risk = c.freeTime?.risk;
    if (risk === "RIESGO_PROXIMO" || risk === "RIESGO_ALTO") atRisk += 1;
    if (risk === "CARGO_ACUMULANDOSE") accruing += 1;
  }
  return { total: rows.length, active, atRisk, accruing };
}
