import { stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "./crypto";
import { loadManifest, formatSize } from "./manifest";

export interface VerifyResult {
  valid: boolean;
  checkedFiles: number;
  errors: string[];
}

export async function verifyBackup(backupDir: string): Promise<VerifyResult> {
  const manifestPath = join(backupDir, "manifest.json");
  const errors: string[] = [];

  console.log("[verify] Loading manifest...");
  const manifest = await loadManifest(manifestPath);
  console.log(`[verify] Manifest: ${manifest.entryCount} entries, created ${manifest.createdAt}`);

  let checkedFiles = 0;

  for (const entry of manifest.entries) {
    const filePath = join(backupDir, entry.filename);

    try {
      const fileStats = await stat(filePath);

      if (fileStats.size !== entry.encryptedSize) {
        errors.push(`${entry.filename}: size mismatch (expected ${entry.encryptedSize}, got ${fileStats.size})`);
        continue;
      }

      const sha256 = await sha256File(filePath);
      if (sha256 !== entry.encryptedSha256) {
        errors.push(`${entry.filename}: checksum mismatch`);
        continue;
      }

      console.log(`  [OK] ${entry.filename} — ${formatSize(fileStats.size)}, checksum verified`);
      checkedFiles++;
    } catch (err) {
      errors.push(`${entry.filename}: file not found or unreadable`);
    }
  }

  const valid = errors.length === 0 && checkedFiles === manifest.entryCount;

  if (valid) {
    console.log(`[verify] All ${checkedFiles} files verified successfully`);
  } else {
    console.log(`[verify] FAILED — ${errors.length} errors:`);
    for (const err of errors) {
      console.log(`  [ERROR] ${err}`);
    }
  }

  return { valid, checkedFiles, errors };
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: tsx scripts/backup/verify-backup.ts <backup-directory>");
    process.exit(1);
  }
  verifyBackup(dir)
    .then((result) => {
      process.exit(result.valid ? 0 : 1);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
