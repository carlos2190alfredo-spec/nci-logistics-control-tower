import { getDb } from "@/lib/server/db";
import { isSupportActive, minutesRemaining, type SupportSessionLite } from "@/lib/support/session";

export type ActiveSupportSummary = {
  id: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date | null;
  supporterEmail: string;
  minutesLeft: number;
};

/**
 * Trae la sesión de soporte ACTIVA (no cerrada ni expirada) del tenant, si
 * existe. Determinista: usa el helper puro `isSupportActive`. Null si no hay.
 */
export async function getActiveSupportSession(
  tenantId: string,
  now: Date = new Date(),
): Promise<ActiveSupportSummary | null> {
  const candidates = await getDb().tenantSupportSession.findMany({
    where: { tenantId, endedAt: null },
    orderBy: { startedAt: "desc" },
    take: 5,
    include: { tenant: { select: { id: true } } },
  });

  for (const c of candidates) {
    const lite: SupportSessionLite = {
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      expiresAt: c.expiresAt,
    };
    if (!isSupportActive(lite, now)) continue;

    const supporter = await getDb().user.findUnique({
      where: { id: c.userId },
      select: { email: true },
    });
    return {
      id: c.id,
      reason: c.reason,
      startedAt: c.startedAt,
      expiresAt: c.expiresAt,
      supporterEmail: supporter?.email ?? "soporte",
      minutesLeft: minutesRemaining(lite, now),
    };
  }
  return null;
}

export async function getTenantSupportHistory(tenantId: string, take = 20) {
  return getDb().tenantSupportSession.findMany({
    where: { tenantId },
    orderBy: { startedAt: "desc" },
    take,
  });
}
