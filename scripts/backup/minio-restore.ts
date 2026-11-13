import { readFile, unlink } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { decryptFile, sha256File } from "./crypto";
import { type BackupEntry } from "./manifest";

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
    region: process.env.STORAGE_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || "nci_minio",
      secretAccessKey: process.env.MINIO_SECRET_KEY || "nci_minio_password",
    },
  });
}

export interface MinioRestoreResult {
  type: "minio";
  success: boolean;
  bucket: string;
  objectCount: number;
  error?: string;
}

export async function restoreMinio(
  backupDir: string,
  entry: BackupEntry,
  options: { targetBucket?: string; verify?: boolean } = {},
): Promise<MinioRestoreResult> {
  const targetBucket = options.targetBucket || "nci-logistics-restore-test";
  const encFile = join(backupDir, entry.filename);
  const tarFile = encFile.replace(/\.enc$/, "");

  console.log(`[minio-restore] Decrypting ${entry.filename}...`);

  const encSha256 = await sha256File(encFile);
  if (encSha256 !== entry.encryptedSha256) {
    throw new Error("Encrypted file checksum mismatch");
  }

  await decryptFile(encFile, tarFile);

  const tarSha256 = await sha256File(tarFile);
  if (tarSha256 !== entry.sha256) {
    await unlink(tarFile);
    throw new Error("Decrypted file checksum mismatch");
  }

  console.log("[minio-restore] Checksum verified");

  const extractDir = join(backupDir, "_minio_restore_temp");
  const { rm, mkdir } = await import("node:fs/promises");
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });

  try {
    execSync(`tar xf "${tarFile}" -C "${extractDir}"`, { stdio: "pipe" });

    const innerDirs = execSync(`ls "${extractDir}"`, { encoding: "utf-8" }).trim().split("\n");
    const minioDir = join(extractDir, innerDirs[0]);

    const manifestPath = join(minioDir, "_objects.json");
    const objectManifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Array<{
      key: string;
      size: number;
      sha256: string;
    }>;

    const client = getS3Client();

    try {
      await client.send(new HeadBucketCommand({ Bucket: targetBucket }));
      const existing = await client.send(new ListObjectsV2Command({ Bucket: targetBucket }));
      for (const obj of existing.Contents || []) {
        if (obj.Key) {
          await client.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: obj.Key }));
        }
      }
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: targetBucket }));
    }

    console.log(`[minio-restore] Uploading ${objectManifest.length} objects to '${targetBucket}'...`);

    let uploadedCount = 0;
    for (const obj of objectManifest) {
      const safePath = obj.key.replace(/\.\./g, "_").replace(/^\//, "");
      const filePath = join(minioDir, safePath);
      const fileData = await readFile(filePath);

      await client.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: obj.key,
          Body: fileData,
        }),
      );
      uploadedCount++;
    }

    console.log(`[minio-restore] Uploaded ${uploadedCount} objects`);

    if (options.verify !== false) {
      console.log("[minio-restore] Verifying object count in target bucket...");
      let verifiedCount = 0;
      let token: string | undefined;
      do {
        const resp = await client.send(
          new ListObjectsV2Command({ Bucket: targetBucket, ContinuationToken: token }),
        );
        verifiedCount += resp.Contents?.length || 0;
        token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
      } while (token);

      if (verifiedCount !== objectManifest.length) {
        throw new Error(`Object count mismatch: expected ${objectManifest.length}, found ${verifiedCount}`);
      }
      console.log(`[minio-restore] Verified: ${verifiedCount} objects match manifest`);
    }

    console.log(`[minio-restore] Cleaning up test bucket '${targetBucket}'...`);
    const toDelete = await client.send(new ListObjectsV2Command({ Bucket: targetBucket }));
    for (const obj of toDelete.Contents || []) {
      if (obj.Key) {
        await client.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: obj.Key }));
      }
    }

    return { type: "minio", success: true, bucket: targetBucket, objectCount: uploadedCount };
  } finally {
    await unlink(tarFile).catch(() => {});
    await rm(extractDir, { recursive: true, force: true });
  }
}
