import { Socket } from "node:net";
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const HOST = process.env.CLAMAV_HOST ?? "localhost";
const PORT = Number(process.env.CLAMAV_PORT ?? "3310");
const BUCKET = process.env.MINIO_BUCKET ?? "nci-logistics-local";

function sendCommand(command: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    socket.setTimeout(10_000);
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => resolve(Buffer.concat(chunks)));
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.connect(PORT, HOST, () => socket.end(command));
  });
}

async function main() {
  let ok = true;

  try {
    const resp = await sendCommand(Buffer.from("zPING\0"));
    const pong = resp.toString("utf8").replace(/\0/g, "").trim();
    console.log(pong === "PONG" ? "PASS: ClamAV responding" : `FAIL: ClamAV returned '${pong}'`);
    if (pong !== "PONG") ok = false;
  } catch (e) {
    console.error(`FAIL: ClamAV unreachable — ${e}`);
    ok = false;
  }

  try {
    const vResp = await sendCommand(Buffer.from("zVERSION\0"));
    console.log(`INFO: ClamAV ${vResp.toString("utf8").replace(/\0/g, "").trim()}`);
  } catch {
    console.log("INFO: Could not get ClamAV version");
  }

  const db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    console.log("PASS: PostgreSQL responding");
  } catch (e) {
    console.error(`FAIL: PostgreSQL — ${e}`);
    ok = false;
  }

  const counts = await db.fileAttachment.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\nFileAttachment status summary:");
  for (const c of counts) {
    console.log(`  ${c.status}: ${c._count}`);
  }
  if (counts.length === 0) console.log("  (none)");

  const scanEvents = await db.fileScanEvent.count();
  console.log(`\nFileScanEvents: ${scanEvents}`);

  const receipts = await db.attachmentReceipt.count();
  console.log(`AttachmentReceipts: ${receipts}`);

  await db.$disconnect();

  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
    },
    forcePathStyle: true,
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`\nPASS: MinIO bucket '${BUCKET}' accessible`);
  } catch (e) {
    console.error(`\nFAIL: MinIO bucket — ${e}`);
    ok = false;
  }

  console.log(ok ? "\nAll health checks passed." : "\nSome checks failed.");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Health check failed:", err);
  process.exit(1);
});
