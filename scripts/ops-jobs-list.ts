import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";

const db = new PrismaClient();

async function main() {
  console.log("\n  Ultimos jobs ejecutados\n");

  const jobs = await db.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 25,
  });

  if (jobs.length === 0) {
    console.log("  No hay jobs registrados.\n");
    await db.$disconnect();
    return;
  }

  for (const job of jobs) {
    const icon = job.status === "SUCCESS" ? "✓" : job.status === "FAILED" ? "✗" : job.status === "RUNNING" ? "⏳" : "⚠";
    const duration = job.durationMs != null ? `${job.durationMs}ms` : "—";
    const at = job.startedAt.toISOString().replace("T", " ").slice(0, 19);
    console.log(`  ${icon} ${job.jobName.padEnd(25)} ${job.status.padEnd(10)} ${duration.padStart(8)}  ${at}`);
    if (job.errorCode || job.safeErrorMessage) {
      console.log(`    → ${job.errorCode ?? ""} ${job.safeErrorMessage ?? ""}`);
    }
  }

  console.log(`\n  Total: ${jobs.length} jobs (mostrando ultimos 25)\n`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
