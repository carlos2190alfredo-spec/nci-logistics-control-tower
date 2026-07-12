import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { Socket } from "node:net";

const db = new PrismaClient();

type Check = { name: string; status: "HEALTHY" | "DEGRADED" | "UNHEALTHY"; ms: number; message: string; remediation?: string };

async function check(name: string, severity: "critical" | "warning", fn: () => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: "HEALTHY", ms: Date.now() - start, message: "OK" };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 150) : "Error";
    return {
      name,
      status: severity === "critical" ? "UNHEALTHY" : "DEGRADED",
      ms: Date.now() - start,
      message: msg,
      remediation: `Verificar ${name}: docker compose ps / docker compose logs ${name.toLowerCase()}`,
    };
  }
}

async function main() {
  console.log("\n  Chequeo de readiness completo\n");

  const checks = await Promise.all([
    check("PostgreSQL", "critical", async () => {
      const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
      if (rows.length === 0) throw new Error("Empty result");
    }),
    check("Prisma", "critical", async () => { await db.$queryRaw`SELECT 1`; }),
    check("MinIO", "critical", async () => {
      const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
      const res = await fetch(`${endpoint}/minio/health/live`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    check("ClamAV", "critical", () => new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      socket.setTimeout(5000);
      socket.connect(3310, "127.0.0.1", () => socket.write("PING\n"));
      let data = "";
      socket.on("data", (chunk) => { data += chunk.toString(); });
      socket.on("end", () => data.includes("PONG") ? resolve() : reject(new Error(data.trim())));
      socket.on("error", reject);
      socket.on("timeout", () => { socket.destroy(); reject(new Error("Timeout")); });
    })),
    check("Mailpit", "warning", async () => {
      const res = await fetch("http://localhost:8025/api/v1/info", { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const hasCritical = checks.some((c) => c.status === "UNHEALTHY");
  const hasDegraded = checks.some((c) => c.status === "DEGRADED" || c.status === "UNHEALTHY");
  const overall = hasCritical ? "UNHEALTHY" : hasDegraded ? "DEGRADED" : "HEALTHY";

  for (const c of checks) {
    const icon = c.status === "HEALTHY" ? "✓" : c.status === "DEGRADED" ? "⚠" : "✗";
    console.log(`  ${icon} ${c.name.padEnd(14)} ${c.status.padEnd(10)} ${String(c.ms).padStart(5)} ms  ${c.message}`);
    if (c.remediation && c.status !== "HEALTHY") {
      console.log(`    → ${c.remediation}`);
    }
  }

  console.log(`\n  Estado general: ${overall}\n`);

  const json = { status: overall, checkedAt: new Date().toISOString(), checks };
  console.log(JSON.stringify(json, null, 2));

  await db.$disconnect();
  process.exit(overall === "HEALTHY" ? 0 : 1);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
