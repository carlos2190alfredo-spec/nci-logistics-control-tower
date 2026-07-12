import { execSync } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { encryptFile, sha256File } from "./crypto";
import { type BackupEntry, type BackupManifest, addEntry } from "./manifest";

export async function backupPostgres(backupDir: string, manifest: BackupManifest): Promise<void> {
  const stamp = manifest.createdAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const dumpFile = join(backupDir, `postgres-${stamp}.sql`);
  const encFile = `${dumpFile}.enc`;

  console.log("[postgres] Running pg_dump...");

  execSync(
    `docker compose exec -T postgres pg_dump -U nci --no-owner --no-privileges --clean --if-exists nci_logistics`,
    {
      cwd: process.env.PROJECT_ROOT || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 100 * 1024 * 1024,
      encoding: "buffer",
    },
  );

  execSync(
    `docker compose exec -T postgres pg_dump -U nci --no-owner --no-privileges --clean --if-exists nci_logistics > "${dumpFile}"`,
    {
      cwd: process.env.PROJECT_ROOT || process.cwd(),
      shell: "/bin/bash",
      stdio: "pipe",
      maxBuffer: 100 * 1024 * 1024,
    },
  );

  const dumpStats = await stat(dumpFile);
  if (dumpStats.size === 0) {
    throw new Error("pg_dump produced an empty file — backup aborted");
  }

  const sha256 = await sha256File(dumpFile);
  console.log(`[postgres] Dump: ${(dumpStats.size / 1024).toFixed(1)} KB, SHA-256: ${sha256.slice(0, 16)}...`);

  console.log("[postgres] Encrypting...");
  const { iv, authTag } = await encryptFile(dumpFile, encFile);

  const encStats = await stat(encFile);
  const encSha256 = await sha256File(encFile);

  await unlink(dumpFile);

  const entry: BackupEntry = {
    filename: `postgres-${stamp}.sql.enc`,
    type: "postgres",
    originalSize: dumpStats.size,
    encryptedSize: encStats.size,
    sha256,
    encryptedSha256: encSha256,
    iv,
    authTag,
    metadata: {
      database: "nci_logistics",
      user: "nci",
    },
  };

  addEntry(manifest, entry);
  console.log(`[postgres] Encrypted: ${(encStats.size / 1024).toFixed(1)} KB`);
}
