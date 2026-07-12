import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, readFile, unlink, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { encryptFile, decryptFile, sha256File, sha256Buffer, HEADER_MAGIC } from "./crypto";
import { createManifest, addEntry, saveManifest, loadManifest, formatSize, type BackupEntry } from "./manifest";

const TEST_DIR = join(process.cwd(), "backups", "_test_backup");

beforeAll(async () => {
  process.env.BACKUP_ENCRYPTION_KEY = "a".repeat(64);
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("backup crypto", () => {
  const plainFile = join(TEST_DIR, "test-plain.txt");
  const encFile = join(TEST_DIR, "test-plain.txt.enc");
  const decFile = join(TEST_DIR, "test-decrypted.txt");
  const testContent = "Hello, NCI Logistics Control Tower backup test!\n".repeat(100);

  it("encrypts and decrypts a file correctly", async () => {
    await writeFile(plainFile, testContent, "utf-8");

    const { iv, authTag } = await encryptFile(plainFile, encFile);
    expect(iv).toHaveLength(32);
    expect(authTag).toHaveLength(32);

    await decryptFile(encFile, decFile);
    const decrypted = await readFile(decFile, "utf-8");
    expect(decrypted).toBe(testContent);

    await unlink(plainFile);
    await unlink(encFile);
    await unlink(decFile);
  });

  it("encrypted file starts with NCIBAK01 magic header", async () => {
    await writeFile(plainFile, "test data", "utf-8");
    await encryptFile(plainFile, encFile);

    const header = Buffer.alloc(8);
    const fd = await readFile(encFile);
    fd.copy(header, 0, 0, 8);
    expect(header.equals(HEADER_MAGIC)).toBe(true);

    await unlink(plainFile);
    await unlink(encFile);
  });

  it("rejects tampered encrypted file", async () => {
    await writeFile(plainFile, "original content", "utf-8");
    await encryptFile(plainFile, encFile);

    const data = await readFile(encFile);
    data[data.length - 5] ^= 0xff;
    await writeFile(encFile, data);

    await expect(decryptFile(encFile, decFile)).rejects.toThrow();

    await unlink(plainFile);
    await unlink(encFile);
  });

  it("rejects file without valid magic header", async () => {
    const fakeData = Buffer.alloc(100, 0x42);
    await writeFile(encFile, fakeData);
    await expect(decryptFile(encFile, decFile)).rejects.toThrow(/magic header/);
    await unlink(encFile);
  });

  it("sha256File produces consistent hash", async () => {
    const content = "deterministic content";
    await writeFile(plainFile, content, "utf-8");
    const hash1 = await sha256File(plainFile);
    const hash2 = await sha256File(plainFile);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    await unlink(plainFile);
  });

  it("sha256Buffer matches sha256File", async () => {
    const content = Buffer.from("matching hashes test");
    await writeFile(plainFile, content);
    const fileHash = await sha256File(plainFile);
    const bufHash = sha256Buffer(content);
    expect(fileHash).toBe(bufHash);
    await unlink(plainFile);
  });

  it("rejects missing BACKUP_ENCRYPTION_KEY", async () => {
    const origKey = process.env.BACKUP_ENCRYPTION_KEY;
    delete process.env.BACKUP_ENCRYPTION_KEY;

    await writeFile(plainFile, "test", "utf-8");
    await expect(encryptFile(plainFile, encFile)).rejects.toThrow(/BACKUP_ENCRYPTION_KEY/);

    process.env.BACKUP_ENCRYPTION_KEY = origKey;
    await unlink(plainFile);
  });
});

describe("backup manifest", () => {
  const manifestPath = join(TEST_DIR, "test-manifest.json");

  it("creates manifest with correct structure", () => {
    const manifest = createManifest();
    expect(manifest.version).toBe("1.0");
    expect(manifest.entries).toEqual([]);
    expect(manifest.entryCount).toBe(0);
    expect(manifest.totalOriginalSize).toBe(0);
    expect(manifest.totalEncryptedSize).toBe(0);
    expect(manifest.createdAt).toBeTruthy();
  });

  it("adds entries and updates totals", () => {
    const manifest = createManifest();
    const entry: BackupEntry = {
      filename: "test.sql.enc",
      type: "postgres",
      originalSize: 1000,
      encryptedSize: 1100,
      sha256: "abc",
      encryptedSha256: "def",
      iv: "iv",
      authTag: "tag",
    };
    addEntry(manifest, entry);
    expect(manifest.entryCount).toBe(1);
    expect(manifest.totalOriginalSize).toBe(1000);
    expect(manifest.totalEncryptedSize).toBe(1100);
  });

  it("saves and loads manifest", async () => {
    const manifest = createManifest();
    addEntry(manifest, {
      filename: "test.sql.enc",
      type: "postgres",
      originalSize: 2000,
      encryptedSize: 2200,
      sha256: "aaa",
      encryptedSha256: "bbb",
      iv: "iv1",
      authTag: "tag1",
    });
    await saveManifest(manifest, manifestPath);

    const loaded = await loadManifest(manifestPath);
    expect(loaded.version).toBe("1.0");
    expect(loaded.entryCount).toBe(1);
    expect(loaded.entries[0].filename).toBe("test.sql.enc");
    await unlink(manifestPath);
  });

  it("rejects manifest with no entries", async () => {
    const empty = { version: "1.0", createdAt: "", hostname: "", entries: [], totalOriginalSize: 0, totalEncryptedSize: 0, entryCount: 0 };
    await writeFile(manifestPath, JSON.stringify(empty), "utf-8");
    await expect(loadManifest(manifestPath)).rejects.toThrow(/no entries/);
    await unlink(manifestPath);
  });

  it("rejects manifest with wrong version", async () => {
    const bad = { version: "2.0", entries: [{}] };
    await writeFile(manifestPath, JSON.stringify(bad), "utf-8");
    await expect(loadManifest(manifestPath)).rejects.toThrow(/Unsupported manifest version/);
    await unlink(manifestPath);
  });
});

describe("formatSize", () => {
  it("formats bytes correctly", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1048576)).toBe("1.0 MB");
    expect(formatSize(2621440)).toBe("2.5 MB");
  });
});

describe("backup security invariants", () => {
  it("crypto module uses AES-256-GCM", async () => {
    const source = await readFile(join(process.cwd(), "scripts/backup/crypto.ts"), "utf-8");
    expect(source).toContain("aes-256-gcm");
  });

  it("crypto module uses SHA-256 for checksums", async () => {
    const source = await readFile(join(process.cwd(), "scripts/backup/crypto.ts"), "utf-8");
    expect(source).toContain('createHash("sha256")');
  });

  it("config backup excludes .env files", async () => {
    const source = await readFile(join(process.cwd(), "scripts/backup/config-backup.ts"), "utf-8");
    expect(source).toContain("env\\.local");
    expect(source).toContain("env\\.production");
    expect(source).toContain("EXCLUDED_PATTERNS");
  });

  it("plain dump is deleted after encryption", async () => {
    const pgSource = await readFile(join(process.cwd(), "scripts/backup/postgres-backup.ts"), "utf-8");
    expect(pgSource).toContain("unlink(dumpFile)");

    const minioSource = await readFile(join(process.cwd(), "scripts/backup/minio-backup.ts"), "utf-8");
    expect(minioSource).toContain("unlink(tarFile)");

    const configSource = await readFile(join(process.cwd(), "scripts/backup/config-backup.ts"), "utf-8");
    expect(configSource).toContain("unlink(jsonFile)");
  });

  it("restore validates checksums before proceeding", async () => {
    const pgRestore = await readFile(join(process.cwd(), "scripts/backup/postgres-restore.ts"), "utf-8");
    expect(pgRestore).toContain("checksum mismatch");

    const minioRestore = await readFile(join(process.cwd(), "scripts/backup/minio-restore.ts"), "utf-8");
    expect(minioRestore).toContain("checksum mismatch");
  });

  it("gitignore excludes backups directory", async () => {
    const gitignore = await readFile(join(process.cwd(), ".gitignore"), "utf-8");
    expect(gitignore).toContain("/backups/");
  });

  it("drill restores to isolated database, not production", async () => {
    const drillSource = await readFile(join(process.cwd(), "scripts/backup/postgres-restore.ts"), "utf-8");
    expect(drillSource).toContain("nci_logistics_restore_test");
    expect(drillSource).not.toContain('targetDb || "nci_logistics"');
  });

  it("drill restores to isolated bucket, not production", async () => {
    const drillSource = await readFile(join(process.cwd(), "scripts/backup/minio-restore.ts"), "utf-8");
    expect(drillSource).toContain("nci-logistics-restore-test");
    expect(drillSource).not.toContain('targetBucket || "nci-logistics-local"');
  });
});
