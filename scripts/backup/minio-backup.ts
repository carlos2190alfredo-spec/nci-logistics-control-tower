import { writeFile, stat, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { encryptFile, sha256File } from "./crypto";
import { type BackupManifest, addEntry } from "./manifest";

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

interface MinioObject {
  key: string;
  size: number;
  lastModified: string;
  sha256: string;
}

async function listAllObjects(client: S3Client, bucket: string): Promise<MinioObject[]> {
  const objects: MinioObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Size !== undefined) {
        objects.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified?.toISOString() || "",
          sha256: "",
        });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

async function downloadObject(client: S3Client, bucket: string, key: string, destPath: string): Promise<void> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) throw new Error(`Empty response for ${key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  await writeFile(destPath, Buffer.concat(chunks));
}

export async function backupMinio(backupDir: string, manifest: BackupManifest): Promise<void> {
  const bucket = process.env.MINIO_BUCKET || "nci-logistics-local";
  const client = getS3Client();
  const stamp = manifest.createdAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

  console.log(`[minio] Listing objects in bucket '${bucket}'...`);
  const objects = await listAllObjects(client, bucket);
  console.log(`[minio] Found ${objects.length} objects`);

  if (objects.length === 0) {
    console.log("[minio] No objects to backup — skipping");
    return;
  }

  const minioDir = join(backupDir, `minio-${stamp}`);
  await mkdir(minioDir, { recursive: true });

  const objectManifest: MinioObject[] = [];
  let totalSize = 0;

  for (const obj of objects) {
    const safePath = obj.key.replace(/\.\./g, "_").replace(/^\//, "");
    const destDir = join(minioDir, ...safePath.split("/").slice(0, -1));
    await mkdir(destDir, { recursive: true });
    const destPath = join(minioDir, safePath);

    await downloadObject(client, bucket, obj.key, destPath);
    obj.sha256 = await sha256File(destPath);
    objectManifest.push(obj);
    totalSize += obj.size;
  }

  const objectManifestPath = join(minioDir, "_objects.json");
  await writeFile(objectManifestPath, JSON.stringify(objectManifest, null, 2), "utf-8");

  const tarFile = join(backupDir, `minio-${stamp}.tar`);
  const { execSync } = await import("node:child_process");
  execSync(`tar cf "${tarFile}" -C "${backupDir}" "minio-${stamp}"`, { stdio: "pipe" });

  const tarStats = await stat(tarFile);
  const tarSha256 = await sha256File(tarFile);

  console.log(`[minio] Archive: ${(tarStats.size / 1024).toFixed(1)} KB, ${objects.length} objects`);
  console.log("[minio] Encrypting...");

  const encFile = `${tarFile}.enc`;
  const { iv, authTag } = await encryptFile(tarFile, encFile);

  const encStats = await stat(encFile);
  const encSha256 = await sha256File(encFile);

  await unlink(tarFile);
  const { rm } = await import("node:fs/promises");
  await rm(minioDir, { recursive: true, force: true });

  addEntry(manifest, {
    filename: `minio-${stamp}.tar.enc`,
    type: "minio",
    originalSize: tarStats.size,
    encryptedSize: encStats.size,
    sha256: tarSha256,
    encryptedSha256: encSha256,
    iv,
    authTag,
    metadata: {
      bucket,
      objectCount: objects.length,
      totalObjectSize: totalSize,
    },
  });

  console.log(`[minio] Encrypted: ${(encStats.size / 1024).toFixed(1)} KB`);
}
