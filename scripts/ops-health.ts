import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { Socket } from "node:net";

const db = new PrismaClient();

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ name: string; ok: boolean; ms: number; detail: string }> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start, detail: "OK" };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - start, detail: err instanceof Error ? err.message.slice(0, 120) : "Error" };
  }
}

async function main() {
  console.log("\n  Chequeo de salud del sistema\n");

  const checks = await Promise.all([
    timed("PostgreSQL", async () => {
      const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
      if (rows.length === 0) throw new Error("Empty result");
    }),
    timed("Prisma", async () => {
      await db.$queryRaw`SELECT 1`;
    }),
    timed("MinIO", async () => {
      const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${endpoint}/minio/health/live`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } finally {
        clearTimeout(timeout);
      }
    }),
    timed("ClamAV", () => {
      return new Promise<void>((resolve, reject) => {
        const socket = new Socket();
        socket.setTimeout(5000);
        socket.connect(3310, "127.0.0.1", () => socket.write("PING\n"));
        let data = "";
        socket.on("data", (chunk) => { data += chunk.toString(); });
        socket.on("end", () => {
          if (data.includes("PONG")) resolve();
          else reject(new Error(`Unexpected: ${data.trim()}`));
        });
        socket.on("error", reject);
        socket.on("timeout", () => { socket.destroy(); reject(new Error("Timeout")); });
      });
    }),
    timed("Mailpit", async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch("http://localhost:8025/api/v1/info", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } finally {
        clearTimeout(timeout);
      }
    }),
  ]);

  let allOk = true;
  for (const c of checks) {
    const icon = c.ok ? "✓" : "✗";
    console.log(`  ${icon} ${c.name.padEnd(14)} ${String(c.ms).padStart(5)} ms  ${c.detail}`);
    if (!c.ok) allOk = false;
  }

  console.log(`\n  Estado general: ${allOk ? "SALUDABLE" : "CON PROBLEMAS"}\n`);
  await db.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
