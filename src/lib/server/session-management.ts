import { getDb } from "@/lib/server/db";

/** Descripción de sesión SEGURA para exponer en la UI del propietario. */
export type SessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  userAgentShort: string;
  browserFamily: string;
  isCurrent: boolean;
};

/**
 * Extrae una familia legible del User-Agent SIN filtrar la cadena completa.
 * "Chrome en macOS", "Firefox en Windows", "Safari en iOS", etc.
 */
function summarizeUserAgent(userAgent: string | null): { short: string; family: string } {
  if (!userAgent) return { short: "Dispositivo desconocido", family: "Desconocido" };
  const ua = userAgent.slice(0, 200);
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Otro sistema";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  return { short: `${browser} en ${os}`, family: browser };
}

export async function listUserSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
  const sessions = await getDb().session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.map((session) => {
    const summary = summarizeUserAgent(session.userAgent);
    return {
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      userAgentShort: summary.short,
      browserFamily: summary.family,
      isCurrent: session.id === currentSessionId,
    };
  });
}
