import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { createManifest, saveManifest, formatSize } from "./manifest";
import { backupPostgres } from "./postgres-backup";
import { backupMinio } from "./minio-backup";
import { backupConfig } from "./config-backup";
import { restorePostgres } from "./postgres-restore";
import { restoreMinio } from "./minio-restore";
import { verifyBackup } from "./verify-backup";

config({ path: ".env.local" });

interface DrillResult {
  success: boolean;
  backupDir: string;
  steps: Array<{ step: string; success: boolean; duration: number; detail?: string }>;
  totalDuration: number;
}

async function runDrill(): Promise<DrillResult> {
  const drillStart = Date.now();
  const steps: DrillResult["steps"] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const backupDir = join(process.cwd(), "backups", `drill-${stamp}`);

  console.log("=".repeat(60));
  console.log("  DISASTER RECOVERY DRILL");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Output:  ${backupDir}`);
  console.log("=".repeat(60));
  console.log();

  await mkdir(backupDir, { recursive: true });

  const manifest = createManifest();

  // Step 1: Backup PostgreSQL
  let stepStart = Date.now();
  try {
    await backupPostgres(backupDir, manifest);
    steps.push({ step: "Backup PostgreSQL", success: true, duration: Date.now() - stepStart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] Backup PostgreSQL: ${msg}`);
    steps.push({ step: "Backup PostgreSQL", success: false, duration: Date.now() - stepStart, detail: msg });
  }

  // Step 2: Backup MinIO
  stepStart = Date.now();
  try {
    await backupMinio(backupDir, manifest);
    steps.push({ step: "Backup MinIO", success: true, duration: Date.now() - stepStart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] Backup MinIO: ${msg}`);
    steps.push({ step: "Backup MinIO", success: false, duration: Date.now() - stepStart, detail: msg });
  }

  // Step 3: Backup config
  stepStart = Date.now();
  try {
    await backupConfig(backupDir, manifest);
    steps.push({ step: "Backup config", success: true, duration: Date.now() - stepStart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] Backup config: ${msg}`);
    steps.push({ step: "Backup config", success: false, duration: Date.now() - stepStart, detail: msg });
  }

  // Step 4: Save manifest
  stepStart = Date.now();
  try {
    await saveManifest(manifest, join(backupDir, "manifest.json"));
    steps.push({ step: "Save manifest", success: true, duration: Date.now() - stepStart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "Save manifest", success: false, duration: Date.now() - stepStart, detail: msg });
  }

  console.log();
  console.log("-".repeat(60));
  console.log("  PHASE 2: VERIFY BACKUP INTEGRITY");
  console.log("-".repeat(60));
  console.log();

  // Step 5: Verify backup
  stepStart = Date.now();
  try {
    const verifyResult = await verifyBackup(backupDir);
    steps.push({
      step: "Verify backup integrity",
      success: verifyResult.valid,
      duration: Date.now() - stepStart,
      detail: verifyResult.valid
        ? `${verifyResult.checkedFiles} files verified`
        : verifyResult.errors.join("; "),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "Verify backup integrity", success: false, duration: Date.now() - stepStart, detail: msg });
  }

  console.log();
  console.log("-".repeat(60));
  console.log("  PHASE 3: RESTORE AND VERIFY");
  console.log("-".repeat(60));
  console.log();

  // Step 6: Restore PostgreSQL
  const pgEntry = manifest.entries.find((e) => e.type === "postgres");
  if (pgEntry) {
    stepStart = Date.now();
    try {
      const pgResult = await restorePostgres(backupDir, pgEntry);
      steps.push({
        step: "Restore PostgreSQL",
        success: pgResult.success,
        duration: Date.now() - stepStart,
        detail: `${pgResult.tableCount} tables restored and verified`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FAIL] Restore PostgreSQL: ${msg}`);
      steps.push({ step: "Restore PostgreSQL", success: false, duration: Date.now() - stepStart, detail: msg });
    }
  } else {
    steps.push({ step: "Restore PostgreSQL", success: false, duration: 0, detail: "No PostgreSQL entry in manifest" });
  }

  // Step 7: Restore MinIO
  const minioEntry = manifest.entries.find((e) => e.type === "minio");
  if (minioEntry) {
    stepStart = Date.now();
    try {
      const minioResult = await restoreMinio(backupDir, minioEntry);
      steps.push({
        step: "Restore MinIO",
        success: minioResult.success,
        duration: Date.now() - stepStart,
        detail: `${minioResult.objectCount} objects restored and verified`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FAIL] Restore MinIO: ${msg}`);
      steps.push({ step: "Restore MinIO", success: false, duration: Date.now() - stepStart, detail: msg });
    }
  } else {
    steps.push({ step: "Restore MinIO", success: false, duration: 0, detail: "No MinIO entry in manifest — bucket may be empty" });
  }

  const totalDuration = Date.now() - drillStart;
  const allSuccess = steps.every((s) => s.success);

  console.log();
  console.log("=".repeat(60));
  console.log(`  DRILL ${allSuccess ? "PASSED" : "FAILED"}`);
  console.log("=".repeat(60));
  console.log();

  console.log("Summary:");
  for (const s of steps) {
    const status = s.success ? "PASS" : "FAIL";
    const dur = `${(s.duration / 1000).toFixed(1)}s`;
    console.log(`  [${status}] ${s.step} (${dur})${s.detail ? ` — ${s.detail}` : ""}`);
  }

  console.log();
  console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Backup size: ${formatSize(manifest.totalEncryptedSize)}`);
  console.log(`Backup directory: ${backupDir}`);

  // Write drill report
  const report = {
    drillDate: new Date().toISOString(),
    result: allSuccess ? "PASS" : "FAIL",
    steps,
    totalDurationMs: totalDuration,
    manifest: {
      createdAt: manifest.createdAt,
      entryCount: manifest.entryCount,
      totalOriginalSize: manifest.totalOriginalSize,
      totalEncryptedSize: manifest.totalEncryptedSize,
    },
  };

  await writeFile(join(backupDir, "drill-report.json"), JSON.stringify(report, null, 2), "utf-8");

  return { success: allSuccess, backupDir, steps, totalDuration };
}

runDrill()
  .then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Drill failed with unexpected error:", err.message);
    process.exit(1);
  });
