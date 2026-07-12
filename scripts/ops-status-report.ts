import { writeFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { Socket } from "node:net";

const db = new PrismaClient();

type CheckResult = { name: string; status: string; ms: number; message: string };

async function checkService(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: "HEALTHY", ms: Date.now() - start, message: "OK" };
  } catch (err) {
    return { name, status: "UNHEALTHY", ms: Date.now() - start, message: err instanceof Error ? err.message.slice(0, 120) : "Error" };
  }
}

async function main() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const checks = await Promise.all([
    checkService("PostgreSQL", async () => { await db.$queryRaw`SELECT NOW()`; }),
    checkService("Prisma", async () => { await db.$queryRaw`SELECT 1`; }),
    checkService("MinIO", async () => {
      const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
      const res = await fetch(`${endpoint}/minio/health/live`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    checkService("ClamAV", () => new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      socket.setTimeout(5000);
      socket.connect(3310, "127.0.0.1", () => socket.write("PING\n"));
      let data = "";
      socket.on("data", (chunk) => { data += chunk.toString(); });
      socket.on("end", () => data.includes("PONG") ? resolve() : reject(new Error(data.trim())));
      socket.on("error", reject);
      socket.on("timeout", () => { socket.destroy(); reject(new Error("Timeout")); });
    })),
    checkService("Mailpit", async () => {
      const res = await fetch("http://localhost:8025/api/v1/info", { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const [
    tenantCount, userCount, activeSessionCount, activeTrips, closedTrips,
    auditLogCount, serviceRequestCount, recentLoginFailures, recentRateLimits,
    revokedSessions24h, fileStats, offlineConflicts, offlineFailed,
    lastBackup, lastDrill, alertsActive,
  ] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
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
    db.operationalAlert.findMany({ where: { status: "ACTIVE" }, orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }], take: 20 }),
  ]);

  const fileMap: Record<string, number> = {};
  for (const row of fileStats) fileMap[row.status] = row._count;

  const overallStatus = checks.some((c) => c.status === "UNHEALTHY") ? "CON PROBLEMAS" : "SALUDABLE";

  const report = `# Reporte de Estado Operativo

> Generado: ${now.toISOString()}
> Estado general: **${overallStatus}**

## Servicios

| Servicio | Estado | Latencia | Mensaje |
|----------|--------|----------|---------|
${checks.map((c) => `| ${c.name} | ${c.status} | ${c.ms}ms | ${c.message} |`).join("\n")}

## Base de datos

| Metrica | Valor |
|---------|-------|
| Tenants | ${tenantCount} |
| Usuarios | ${userCount} |
| Sesiones activas | ${activeSessionCount} |
| Viajes activos | ${activeTrips} |
| Viajes cerrados | ${closedTrips} |
| Audit logs | ${auditLogCount} |
| Solicitudes de servicio | ${serviceRequestCount} |

## Seguridad

| Metrica | Valor |
|---------|-------|
| Login failures recientes | ${recentLoginFailures} |
| Rate limits activos | ${recentRateLimits} |
| Sesiones revocadas (24h) | ${revokedSessions24h} |
| Archivos infectados | ${fileMap["INFECTED"] ?? 0} |
| Archivos rechazados | ${fileMap["REJECTED"] ?? 0} |

## Archivos

| Estado | Cantidad |
|--------|----------|
| Disponibles | ${fileMap["AVAILABLE"] ?? 0} |
| Pendientes de scan | ${fileMap["PENDING_SCAN"] ?? 0} |
| Escaneando | ${fileMap["SCANNING"] ?? 0} |
| En cuarentena | ${fileMap["QUARANTINE"] ?? 0} |
| Infectados | ${fileMap["INFECTED"] ?? 0} |
| Rechazados | ${fileMap["REJECTED"] ?? 0} |

## Offline sync

| Metrica | Valor |
|---------|-------|
| Conflictos | ${offlineConflicts} |
| Fallos | ${offlineFailed} |

## Backups

| Job | Estado | Fecha |
|-----|--------|-------|
| Ultimo backup | ${lastBackup ? lastBackup.status : "Sin registro"} | ${lastBackup?.finishedAt?.toISOString().slice(0, 19) ?? "—"} |
| Ultimo DR drill | ${lastDrill ? lastDrill.status : "Sin registro"} | ${lastDrill?.finishedAt?.toISOString().slice(0, 19) ?? "—"} |

## Alertas activas

${alertsActive.length === 0 ? "No hay alertas activas." : `| Severidad | Titulo | Fuente | Ocurrencias | Ultima vez |
|-----------|--------|--------|-------------|------------|
${alertsActive.map((a) => `| ${a.severity} | ${a.title} | ${a.source} | ${a.occurrenceCount} | ${a.lastSeenAt.toISOString().slice(0, 19)} |`).join("\n")}`}

## Acciones recomendadas

${checks.filter((c) => c.status !== "HEALTHY").map((c) => `- **${c.name}**: ${c.message}. Verificar con \`docker compose ps\`.`).join("\n") || "Ninguna accion requerida. Todos los sistemas funcionan correctamente."}
${recentLoginFailures > 3 ? `- **Seguridad**: ${recentLoginFailures} usuarios con intentos fallidos de login.` : ""}
${(fileMap["INFECTED"] ?? 0) > 0 ? `- **ClamAV**: ${fileMap["INFECTED"]} archivos infectados detectados — revisar cuarentena.` : ""}
${offlineConflicts > 0 ? `- **Offline**: ${offlineConflicts} conflictos de sincronizacion pendientes.` : ""}
${offlineFailed > 0 ? `- **Offline**: ${offlineFailed} fallos de sincronizacion offline.` : ""}
`;

  const outPath = "docs/OPERABILITY_STATUS_LATEST.md";
  writeFileSync(outPath, report, "utf-8");
  console.log(`\n  Reporte generado: ${outPath}\n`);
  console.log(`  Estado general: ${overallStatus}\n`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
