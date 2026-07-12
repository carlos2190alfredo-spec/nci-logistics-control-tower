import { getDb } from "@/lib/server/db";

export type SystemMetrics = {
  capturedAt: string;
  system: {
    uptime: number;
    version: string;
    commit: string;
    environment: string;
    nodeVersion: string;
  };
  database: {
    tenants: number;
    users: number;
    activeSessions: number;
    mfaVerifiedSessions: number;
    tripsActive: number;
    tripsClosed: number;
    auditLogs: number;
    serviceRequests: number;
  };
  security: {
    recentLoginFailures: number;
    recentRateLimits: number;
    activeSessions: number;
    revokedSessions24h: number;
    infectedFiles: number;
    rejectedFiles: number;
  };
  files: {
    pendingScan: number;
    scanning: number;
    available: number;
    infected: number;
    quarantine: number;
    rejected: number;
  };
  offline: {
    pendingReceipts: number;
    conflictReceipts: number;
    failedReceipts: number;
  };
  backups: {
    lastJobRun: { status: string; finishedAt: string; durationMs: number | null } | null;
    lastDrillRun: { status: string; finishedAt: string; durationMs: number | null } | null;
  };
  alerts: {
    activeP0: number;
    activeP1: number;
    activeP2: number;
    totalActive: number;
  };
};

const appStartedAt = Date.now();

export async function collectMetrics(): Promise<SystemMetrics> {
  const db = getDb();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    tenantCount,
    userCount,
    activeSessionCount,
    mfaSessionCount,
    activeTrips,
    closedTrips,
    auditLogCount,
    serviceRequestCount,
    recentLoginFailures,
    recentRateLimits,
    revokedSessions24h,
    fileStats,
    offlineConflicts,
    offlineFailed,
    lastBackup,
    lastDrill,
    alertsP0,
    alertsP1,
    alertsP2,
  ] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: now }, authLevel: "MFA_VERIFIED" } }),
    db.trip.count({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    db.trip.count({ where: { status: "CLOSED" } }),
    db.auditLog.count(),
    db.serviceRequest.count(),
    db.user.count({ where: { failedLoginAttempts: { gt: 0 } } }),
    db.rateLimitBucket.count({ where: { windowEnd: { gt: oneHourAgo }, count: { gt: 5 } } }),
    db.session.count({ where: { revokedAt: { gte: oneDayAgo } } }),
    db.fileAttachment.groupBy({ by: ["status"], _count: true }),
    db.offlineCommandReceipt.count({ where: { status: "CONFLICT" } }),
    db.offlineCommandReceipt.count({ where: { status: "FAILED" } }),
    db.jobRun.findFirst({ where: { jobName: { startsWith: "backup" } }, orderBy: { startedAt: "desc" } }),
    db.jobRun.findFirst({ where: { jobName: "backup:drill" }, orderBy: { startedAt: "desc" } }),
    db.operationalAlert.count({ where: { status: "ACTIVE", severity: "P0" } }),
    db.operationalAlert.count({ where: { status: "ACTIVE", severity: "P1" } }),
    db.operationalAlert.count({ where: { status: "ACTIVE", severity: "P2" } }),
  ]);

  const fileMap: Record<string, number> = {};
  for (const row of fileStats) {
    fileMap[row.status] = row._count;
  }

  return {
    capturedAt: now.toISOString(),
    system: {
      uptime: Math.floor((Date.now() - appStartedAt) / 1000),
      version: process.env.npm_package_version ?? "0.1.0",
      commit: process.env.COMMIT_SHA ?? "local",
      environment: process.env.NODE_ENV ?? "development",
      nodeVersion: process.version,
    },
    database: {
      tenants: tenantCount,
      users: userCount,
      activeSessions: activeSessionCount,
      mfaVerifiedSessions: mfaSessionCount,
      tripsActive: activeTrips,
      tripsClosed: closedTrips,
      auditLogs: auditLogCount,
      serviceRequests: serviceRequestCount,
    },
    security: {
      recentLoginFailures,
      recentRateLimits,
      activeSessions: activeSessionCount,
      revokedSessions24h,
      infectedFiles: fileMap["INFECTED"] ?? 0,
      rejectedFiles: fileMap["REJECTED"] ?? 0,
    },
    files: {
      pendingScan: fileMap["PENDING_SCAN"] ?? 0,
      scanning: fileMap["SCANNING"] ?? 0,
      available: fileMap["AVAILABLE"] ?? 0,
      infected: fileMap["INFECTED"] ?? 0,
      quarantine: fileMap["QUARANTINE"] ?? 0,
      rejected: fileMap["REJECTED"] ?? 0,
    },
    offline: {
      pendingReceipts: 0,
      conflictReceipts: offlineConflicts,
      failedReceipts: offlineFailed,
    },
    backups: {
      lastJobRun: lastBackup ? { status: lastBackup.status, finishedAt: lastBackup.finishedAt?.toISOString() ?? "", durationMs: lastBackup.durationMs } : null,
      lastDrillRun: lastDrill ? { status: lastDrill.status, finishedAt: lastDrill.finishedAt?.toISOString() ?? "", durationMs: lastDrill.durationMs } : null,
    },
    alerts: {
      activeP0: alertsP0,
      activeP1: alertsP1,
      activeP2: alertsP2,
      totalActive: alertsP0 + alertsP1 + alertsP2,
    },
  };
}
