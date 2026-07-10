import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const dryRun = process.argv.includes("--dry-run");
const db = new PrismaClient();

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET ?? "nci-logistics-local";
const INFECTED_RETENTION_DAYS = 7;
const PENDING_SCAN_RETENTION_DAYS = 1;

interface CleanupSummary {
  infectedExpired: number;
  pendingScanExpired: number;
  orphanedQuarantine: number;
  receiptsPurged: number;
  errors: string[];
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function deleteObject(key: string): Promise<void> {
  if (dryRun) return;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function cleanupInfected(): Promise<number> {
  const cutoff = new Date(Date.now() - INFECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const infected = await db.fileAttachment.findMany({
    where: {
      status: { in: ["INFECTED", "REJECTED"] },
      createdAt: { lt: cutoff },
    },
  });

  let count = 0;
  for (const f of infected) {
    console.log(`${dryRun ? "[DRY-RUN] " : ""}Cleanup infected: ${f.quarantineKey} (${f.status})`);
    const exists = await objectExists(f.quarantineKey);
    if (exists) {
      await deleteObject(f.quarantineKey);
    }
    if (!dryRun) {
      await db.fileAttachment.delete({ where: { id: f.id } });
    }
    count++;
  }
  return count;
}

async function cleanupPendingScan(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_SCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const pending = await db.fileAttachment.findMany({
    where: {
      status: "PENDING_SCAN",
      createdAt: { lt: cutoff },
    },
  });

  let count = 0;
  for (const f of pending) {
    console.log(`${dryRun ? "[DRY-RUN] " : ""}Cleanup expired pending_scan: ${f.quarantineKey}`);
    const exists = await objectExists(f.quarantineKey);
    if (exists) {
      await deleteObject(f.quarantineKey);
    }
    if (!dryRun) {
      await db.fileAttachment.update({
        where: { id: f.id },
        data: { status: "REJECTED", rejectedAt: new Date() },
      });
    }
    count++;
  }
  return count;
}

async function cleanupExpiredReceipts(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (dryRun) {
    const count = await db.attachmentReceipt.count({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(`[DRY-RUN] Would purge ${count} expired attachment receipts`);
    return count;
  }
  const result = await db.attachmentReceipt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

async function main() {
  console.log(`\n=== File Cleanup ${dryRun ? "(DRY-RUN)" : ""} ===\n`);

  const summary: CleanupSummary = {
    infectedExpired: 0,
    pendingScanExpired: 0,
    orphanedQuarantine: 0,
    receiptsPurged: 0,
    errors: [],
  };

  try {
    summary.infectedExpired = await cleanupInfected();
  } catch (e) {
    summary.errors.push(`infected cleanup: ${e}`);
  }

  try {
    summary.pendingScanExpired = await cleanupPendingScan();
  } catch (e) {
    summary.errors.push(`pending_scan cleanup: ${e}`);
  }

  try {
    summary.receiptsPurged = await cleanupExpiredReceipts();
  } catch (e) {
    summary.errors.push(`receipt cleanup: ${e}`);
  }

  console.log("\n=== Summary ===");
  console.log(`Infected/Rejected expired: ${summary.infectedExpired}`);
  console.log(`PendingScan expired: ${summary.pendingScanExpired}`);
  console.log(`Receipts purged: ${summary.receiptsPurged}`);
  if (summary.errors.length) {
    console.error(`Errors: ${summary.errors.join("; ")}`);
  }
  console.log("");

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
