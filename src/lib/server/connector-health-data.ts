import { getDb } from "@/lib/server/db";
import { CONNECTOR_CATALOG } from "@/lib/integrations/registry";
import { evaluateConnectorHealth, type ConnectorHealthResult } from "@/lib/integrations/health";
import type { IntegrationConnectorType } from "@/generated/prisma";

export type ConnectorHealthRow = {
  type: IntegrationConnectorType;
  name: string;
  description: string;
  enabled: boolean;
  status: string;
  lastSyncAt: Date | null;
  requiredCredentials: number;
  presentCredentials: number;
  recentProcessed: number;
  recentFailed: number;
  lastError: string | null;
  result: ConnectorHealthResult;
};

const RECENT_WINDOW_DAYS = 7;

/**
 * Salud de todos los conectores del catálogo para un tenant. Determinista:
 * refleja estado declarado + credenciales + eventos recientes. No hace llamadas
 * externas ni simula conexiones.
 */
export async function getConnectorHealth(
  tenantId: string,
  now: Date = new Date(),
): Promise<ConnectorHealthRow[]> {
  const db = getDb();
  const integrations = await db.tenantIntegration.findMany({
    where: { tenantId },
    include: {
      connector: true,
      credentials: { select: { id: true } },
      events: {
        where: { createdAt: { gte: new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  });

  const byType = new Map(integrations.map((i) => [i.connector.type, i] as const));

  return CONNECTOR_CATALOG.map((meta) => {
    const integ = byType.get(meta.type);
    const requiredCredentials = meta.credentialKeys.length;
    const presentCredentials = integ?.credentials.length ?? 0;
    const events = integ?.events ?? [];
    const recentFailed = events.filter((e) => e.status === "FAILED" || e.errorMessage).length;
    const recentProcessed = events.filter((e) => e.status !== "FAILED" && !e.errorMessage).length;
    const lastError = events.find((e) => e.errorMessage)?.errorMessage ?? null;

    const result = evaluateConnectorHealth({
      enabled: integ?.enabled ?? false,
      status: integ?.status ?? "DISABLED",
      requiredCredentials,
      presentCredentials,
      lastSyncAt: integ?.lastSyncAt ?? null,
      recentProcessed,
      recentFailed,
      now,
    });

    return {
      type: meta.type,
      name: meta.name,
      description: meta.description,
      enabled: integ?.enabled ?? false,
      status: integ?.status ?? "DISABLED",
      lastSyncAt: integ?.lastSyncAt ?? null,
      requiredCredentials,
      presentCredentials,
      recentProcessed,
      recentFailed,
      lastError,
      result,
    };
  });
}
