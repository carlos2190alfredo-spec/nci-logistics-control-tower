import { getDb } from "@/lib/server/db";
import { logger } from "./logger";

export type ServiceStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";

export type HealthCheckResult = {
  name: string;
  status: ServiceStatus;
  durationMs: number;
  checkedAt: string;
  message?: string;
  remediation?: string;
  severity: "critical" | "warning" | "info";
  lastSuccessAt?: string;
};

export type HealthSummary = {
  status: ServiceStatus;
  checkedAt: string;
  uptime: number;
  version: string;
  commit: string;
  environment: string;
  nodeVersion: string;
  checks: HealthCheckResult[];
};

const appStartedAt = Date.now();

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

export async function checkPostgres(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { result, durationMs } = await timed(async () => {
      const db = getDb();
      const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
      return rows.length > 0;
    });
    return {
      name: "postgresql",
      status: result ? "HEALTHY" : "UNHEALTHY",
      durationMs,
      checkedAt,
      severity: "critical",
      ...(result ? {} : { message: "Query returned no rows", remediation: "Verificar docker compose ps y conexion a PostgreSQL" }),
    };
  } catch (err) {
    return {
      name: "postgresql",
      status: "UNHEALTHY",
      durationMs: 0,
      checkedAt,
      message: err instanceof Error ? err.message.slice(0, 200) : "Connection failed",
      remediation: "Verificar que PostgreSQL esta corriendo: docker compose ps",
      severity: "critical",
    };
  }
}

export async function checkMinio(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
    const { result, durationMs } = await timed(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${endpoint}/minio/health/live`, { signal: controller.signal });
        return res.ok;
      } finally {
        clearTimeout(timeout);
      }
    });
    return {
      name: "minio",
      status: result ? "HEALTHY" : "UNHEALTHY",
      durationMs,
      checkedAt,
      severity: "critical",
      ...(result ? {} : { message: "MinIO health endpoint returned non-OK", remediation: "Verificar MinIO: docker compose ps" }),
    };
  } catch (err) {
    return {
      name: "minio",
      status: "UNHEALTHY",
      durationMs: 0,
      checkedAt,
      message: err instanceof Error ? err.message.slice(0, 200) : "Connection failed",
      remediation: "Verificar que MinIO esta corriendo en puerto 9000",
      severity: "critical",
    };
  }
}

export async function checkClamAV(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { result, durationMs } = await timed(async () => {
      const net = await import("node:net");
      return new Promise<string>((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port: 3310 }, () => {
          socket.write("PING\n");
        });
        socket.setTimeout(5000);
        let data = "";
        socket.on("data", (chunk) => { data += chunk.toString(); });
        socket.on("end", () => resolve(data.trim()));
        socket.on("error", reject);
        socket.on("timeout", () => { socket.destroy(); reject(new Error("Timeout")); });
      });
    });
    const healthy = result.includes("PONG");
    return {
      name: "clamav",
      status: healthy ? "HEALTHY" : "UNHEALTHY",
      durationMs,
      checkedAt,
      severity: "critical",
      ...(healthy ? { message: result } : { message: `Unexpected response: ${result.slice(0, 100)}`, remediation: "Verificar ClamAV: docker compose logs clamav" }),
    };
  } catch (err) {
    return {
      name: "clamav",
      status: "UNHEALTHY",
      durationMs: 0,
      checkedAt,
      message: err instanceof Error ? err.message.slice(0, 200) : "Connection failed",
      remediation: "Verificar que ClamAV esta corriendo en 127.0.0.1:3310",
      severity: "critical",
    };
  }
}

export async function checkMailpit(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { result, durationMs } = await timed(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch("http://localhost:8025/api/v1/info", { signal: controller.signal });
        return res.ok;
      } finally {
        clearTimeout(timeout);
      }
    });
    return {
      name: "mailpit",
      status: result ? "HEALTHY" : "DEGRADED",
      durationMs,
      checkedAt,
      severity: "warning",
      ...(result ? {} : { message: "Mailpit no responde", remediation: "Mailpit es opcional en desarrollo" }),
    };
  } catch {
    return {
      name: "mailpit",
      status: "DEGRADED",
      durationMs: 0,
      checkedAt,
      message: "Mailpit no disponible (opcional en desarrollo)",
      severity: "warning",
    };
  }
}

export async function checkPrismaConnection(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { durationMs } = await timed(async () => {
      const db = getDb();
      await db.$queryRaw`SELECT 1`;
    });
    return { name: "prisma", status: "HEALTHY", durationMs, checkedAt, severity: "critical" };
  } catch (err) {
    return {
      name: "prisma",
      status: "UNHEALTHY",
      durationMs: 0,
      checkedAt,
      message: err instanceof Error ? err.message.slice(0, 200) : "Prisma connection failed",
      remediation: "Verificar DATABASE_URL y estado de PostgreSQL",
      severity: "critical",
    };
  }
}

function aggregateStatus(checks: HealthCheckResult[]): ServiceStatus {
  if (checks.some((c) => c.status === "UNHEALTHY" && c.severity === "critical")) return "UNHEALTHY";
  if (checks.some((c) => c.status === "UNHEALTHY" || c.status === "DEGRADED")) return "DEGRADED";
  if (checks.some((c) => c.status === "UNKNOWN")) return "DEGRADED";
  return "HEALTHY";
}

export async function runHealthChecks(): Promise<HealthSummary> {
  const checks = await Promise.all([
    checkPostgres(),
    checkPrismaConnection(),
    checkMinio(),
    checkClamAV(),
    checkMailpit(),
  ]);

  const status = aggregateStatus(checks);

  if (status !== "HEALTHY") {
    logger.warn("health.degraded", {
      service: "health",
      outcome: status,
      checks: checks.filter((c) => c.status !== "HEALTHY").map((c) => c.name).join(","),
    });
  }

  return {
    status,
    checkedAt: new Date().toISOString(),
    uptime: Math.floor((Date.now() - appStartedAt) / 1000),
    version: process.env.npm_package_version ?? "0.1.0",
    commit: process.env.COMMIT_SHA ?? "local",
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    checks,
  };
}

export async function runLivenessCheck(): Promise<{ alive: boolean }> {
  return { alive: true };
}
