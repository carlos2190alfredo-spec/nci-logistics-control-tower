import { execSync } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { decryptFile, sha256File } from "./crypto";
import { type BackupEntry } from "./manifest";

export interface RestoreResult {
  type: "postgres";
  success: boolean;
  database: string;
  tableCount: number;
  error?: string;
}

export async function restorePostgres(
  backupDir: string,
  entry: BackupEntry,
  options: { targetDb?: string; verify?: boolean } = {},
): Promise<RestoreResult> {
  const targetDb = options.targetDb || "nci_logistics_restore_test";
  const encFile = join(backupDir, entry.filename);
  const sqlFile = encFile.replace(/\.enc$/, "");

  console.log(`[postgres-restore] Decrypting ${entry.filename}...`);

  const encSha256 = await sha256File(encFile);
  if (encSha256 !== entry.encryptedSha256) {
    throw new Error(
      `Encrypted file checksum mismatch: expected ${entry.encryptedSha256.slice(0, 16)}..., got ${encSha256.slice(0, 16)}...`,
    );
  }

  await decryptFile(encFile, sqlFile);

  const sha256 = await sha256File(sqlFile);
  if (sha256 !== entry.sha256) {
    await unlink(sqlFile);
    throw new Error(
      `Decrypted file checksum mismatch: expected ${entry.sha256.slice(0, 16)}..., got ${sha256.slice(0, 16)}...`,
    );
  }

  const sqlStats = await stat(sqlFile);
  console.log(`[postgres-restore] Decrypted: ${(sqlStats.size / 1024).toFixed(1)} KB, checksum verified`);

  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  try {
    console.log(`[postgres-restore] Creating isolated database '${targetDb}'...`);
    execSync(
      `docker compose exec -T postgres psql -U nci -d postgres -c "DROP DATABASE IF EXISTS ${targetDb};"`,
      { cwd: projectRoot, stdio: "pipe" },
    );
    execSync(
      `docker compose exec -T postgres psql -U nci -d postgres -c "CREATE DATABASE ${targetDb};"`,
      { cwd: projectRoot, stdio: "pipe" },
    );

    console.log(`[postgres-restore] Restoring to '${targetDb}'...`);
    execSync(
      `docker compose exec -T postgres psql -U nci -d ${targetDb} < "${sqlFile}"`,
      { cwd: projectRoot, shell: "/bin/bash", stdio: "pipe", maxBuffer: 100 * 1024 * 1024 },
    );

    const countOutput = execSync(
      `docker compose exec -T postgres psql -U nci -d ${targetDb} -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"`,
      { cwd: projectRoot, encoding: "utf-8" },
    ).trim();

    const tableCount = parseInt(countOutput, 10);
    console.log(`[postgres-restore] Restored ${tableCount} tables to '${targetDb}'`);

    if (options.verify !== false) {
      console.log("[postgres-restore] Verifying critical tables...");
      const criticalTables = ["users", "tenants", "sessions", "trips", "service_requests", "audit_logs"];
      for (const table of criticalTables) {
        const rowCount = execSync(
          `docker compose exec -T postgres psql -U nci -d ${targetDb} -t -c "SELECT count(*) FROM ${table};" 2>/dev/null || echo "-1"`,
          { cwd: projectRoot, encoding: "utf-8" },
        ).trim();
        const count = parseInt(rowCount, 10);
        if (count < 0) {
          console.log(`  [WARN] Table '${table}' not found in restored database`);
        } else {
          console.log(`  [OK] ${table}: ${count} rows`);
        }
      }
    }

    console.log(`[postgres-restore] Dropping test database '${targetDb}'...`);
    execSync(
      `docker compose exec -T postgres psql -U nci -d postgres -c "DROP DATABASE IF EXISTS ${targetDb};"`,
      { cwd: projectRoot, stdio: "pipe" },
    );

    return { type: "postgres", success: true, database: targetDb, tableCount };
  } finally {
    await unlink(sqlFile).catch(() => {});
  }
}
