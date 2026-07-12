import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { createManifest, saveManifest, formatSize } from "./manifest";
import { backupPostgres } from "./postgres-backup";
import { backupMinio } from "./minio-backup";
import { backupConfig } from "./config-backup";

config({ path: ".env.local" });

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const backupDir = join(process.cwd(), "backups", stamp);
  await mkdir(backupDir, { recursive: true });

  console.log(`Backup directory: ${backupDir}`);
  console.log();

  const manifest = createManifest();

  const target = process.argv[2];

  if (!target || target === "all") {
    await backupPostgres(backupDir, manifest);
    console.log();
    await backupMinio(backupDir, manifest);
    console.log();
    await backupConfig(backupDir, manifest);
  } else if (target === "postgres") {
    await backupPostgres(backupDir, manifest);
  } else if (target === "minio") {
    await backupMinio(backupDir, manifest);
  } else if (target === "config") {
    await backupConfig(backupDir, manifest);
  } else {
    console.error(`Unknown target: ${target}. Use: all, postgres, minio, config`);
    process.exit(1);
  }

  await saveManifest(manifest, join(backupDir, "manifest.json"));

  console.log();
  console.log("Backup complete.");
  console.log(`  Entries: ${manifest.entryCount}`);
  console.log(`  Original size: ${formatSize(manifest.totalOriginalSize)}`);
  console.log(`  Encrypted size: ${formatSize(manifest.totalEncryptedSize)}`);
  console.log(`  Manifest: ${join(backupDir, "manifest.json")}`);
}

main().catch((err) => {
  console.error("Backup failed:", err.message);
  process.exit(1);
});
