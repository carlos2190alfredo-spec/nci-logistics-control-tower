import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";

const db = new PrismaClient();

async function main() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    tenantCount, userCount, activeSessionCount, mfaSessionCount,
    activeTrips, closedTrips, auditLogCount, serviceRequestCount,
    recentLoginFailures, recentRateLimits, revokedSessions24h,
    fileStats, offlineConflicts, offlineFailed,
    lastBackup, lastDrill,
    alertsP0, alertsP1, alertsP2,
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
  for (const row of fileStats) fileMap[row.status] = row._count;

  const metrics = {
    capturedAt: now.toISOString(),
    database: { tenants: tenantCount, users: userCount, activeSessions: activeSessionCount, mfaSessions: mfaSessionCount, tripsActive: activeTrips, tripsClosed: closedTrips, auditLogs: auditLogCount, serviceRequests: serviceRequestCount },
    security: { recentLoginFailures, recentRateLimits, revokedSessions24h, infectedFiles: fileMap["INFECTED"] ?? 0, rejectedFiles: fileMap["REJECTED"] ?? 0 },
    files: { pendingScan: fileMap["PENDING_SCAN"] ?? 0, scanning: fileMap["SCANNING"] ?? 0, available: fileMap["AVAILABLE"] ?? 0, infected: fileMap["INFECTED"] ?? 0, quarantine: fileMap["QUARANTINE"] ?? 0, rejected: fileMap["REJECTED"] ?? 0 },
    offline: { conflictReceipts: offlineConflicts, failedReceipts: offlineFailed },
    backups: {
      lastBackup: lastBackup ? { status: lastBackup.status, at: lastBackup.finishedAt?.toISOString() ?? "" } : null,
      lastDrill: lastDrill ? { status: lastDrill.status, at: lastDrill.finishedAt?.toISOString() ?? "" } : null,
    },
    alerts: { P0: alertsP0, P1: alertsP1, P2: alertsP2, total: alertsP0 + alertsP1 + alertsP2 },
  };

  console.log("\n  Metricas operativas del sistema\n");
  console.log(JSON.stringify(metrics, null, 2));
  console.log();

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
