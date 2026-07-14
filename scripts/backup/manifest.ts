import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";

export interface BackupEntry {
  filename: string;
  type: "postgres" | "minio" | "config";
  originalSize: number;
  encryptedSize: number;
  sha256: string;
  encryptedSha256: string;
  iv: string;
  authTag: string;
  metadata?: Record<string, string | number>;
}

export interface BackupManifest {
  version: "1.0";
  createdAt: string;
  hostname: string;
  entries: BackupEntry[];
  totalOriginalSize: number;
  totalEncryptedSize: number;
  entryCount: number;
}

export function createManifest(): BackupManifest {
  return {
    version: "1.0",
    createdAt: new Date().toISOString(),
    hostname: hostname(),
    entries: [],
    totalOriginalSize: 0,
    totalEncryptedSize: 0,
    entryCount: 0,
  };
}

export function addEntry(manifest: BackupManifest, entry: BackupEntry): void {
  manifest.entries.push(entry);
  manifest.totalOriginalSize += entry.originalSize;
  manifest.totalEncryptedSize += entry.encryptedSize;
  manifest.entryCount = manifest.entries.length;
}

export async function saveManifest(manifest: BackupManifest, path: string): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2), "utf-8");
}

export async function loadManifest(path: string): Promise<BackupManifest> {
  const raw = await readFile(path, "utf-8");
  const manifest = JSON.parse(raw) as BackupManifest;
  if (manifest.version !== "1.0") {
    throw new Error(`Unsupported manifest version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("Manifest has no entries");
  }
  return manifest;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
