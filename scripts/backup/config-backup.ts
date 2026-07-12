import { readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { encryptFile, sha256File } from "./crypto";
import { type BackupManifest, addEntry } from "./manifest";

const CONFIG_FILES = [
  "docker-compose.yml",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "next.config.ts",
  "prisma/schema.prisma",
  "playwright.config.ts",
  ".env.example",
];

const EXCLUDED_PATTERNS = [
  /\.env\.local$/,
  /\.env\.production$/,
  /\.env$/,
  /credentials/i,
  /secret/i,
];

function isSafe(filename: string): boolean {
  return !EXCLUDED_PATTERNS.some((p) => p.test(filename));
}

export async function backupConfig(backupDir: string, manifest: BackupManifest): Promise<void> {
  const stamp = manifest.createdAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  console.log("[config] Collecting configuration files...");

  const collected: Array<{ path: string; content: string }> = [];

  for (const file of CONFIG_FILES) {
    if (!isSafe(file)) {
      console.log(`  [SKIP] ${file} — matches exclusion pattern`);
      continue;
    }
    try {
      const content = await readFile(join(projectRoot, file), "utf-8");
      collected.push({ path: file, content });
      console.log(`  [OK] ${file}`);
    } catch {
      console.log(`  [SKIP] ${file} — not found`);
    }
  }

  if (collected.length === 0) {
    console.log("[config] No config files found — skipping");
    return;
  }

  const bundle = JSON.stringify(
    {
      _type: "nci-lct-config-backup",
      _version: "1.0",
      _createdAt: manifest.createdAt,
      _fileCount: collected.length,
      files: collected,
    },
    null,
    2,
  );

  const jsonFile = join(backupDir, `config-${stamp}.json`);
  await writeFile(jsonFile, bundle, "utf-8");

  const jsonStats = await stat(jsonFile);
  const jsonSha256 = await sha256File(jsonFile);

  console.log(`[config] Bundle: ${(jsonStats.size / 1024).toFixed(1)} KB, ${collected.length} files`);
  console.log("[config] Encrypting...");

  const encFile = `${jsonFile}.enc`;
  const { iv, authTag } = await encryptFile(jsonFile, encFile);

  const encStats = await stat(encFile);
  const encSha256 = await sha256File(encFile);

  await unlink(jsonFile);

  addEntry(manifest, {
    filename: `config-${stamp}.json.enc`,
    type: "config",
    originalSize: jsonStats.size,
    encryptedSize: encStats.size,
    sha256: jsonSha256,
    encryptedSha256: encSha256,
    iv,
    authTag,
    metadata: {
      fileCount: collected.length,
    },
  });

  console.log(`[config] Encrypted: ${(encStats.size / 1024).toFixed(1)} KB`);
}
