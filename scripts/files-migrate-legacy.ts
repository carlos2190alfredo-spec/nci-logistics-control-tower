import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";

const dryRun = process.argv.includes("--dry-run");
const db = new PrismaClient();

interface LegacyReport {
  systemGenerated: string[];
  userUploaded: string[];
  alreadyClassified: string[];
  errors: string[];
}

async function main() {
  console.log(`\n=== Legacy Document Classification ${dryRun ? "(DRY-RUN)" : ""} ===\n`);

  const allDocs = await db.document.findMany({
    include: { trip: true },
  });

  const attachmentKeys = new Set(
    (await db.fileAttachment.findMany({ select: { objectKey: true } }))
      .map((a) => a.objectKey)
      .filter(Boolean) as string[],
  );

  const quarantineKeys = new Set(
    (await db.fileAttachment.findMany({ select: { quarantineKey: true } }))
      .map((a) => a.quarantineKey),
  );

  const report: LegacyReport = {
    systemGenerated: [],
    userUploaded: [],
    alreadyClassified: [],
    errors: [],
  };

  for (const doc of allDocs) {
    if (attachmentKeys.has(doc.objectKey)) {
      report.alreadyClassified.push(`${doc.id} — ${doc.filename} (has FileAttachment)`);
      continue;
    }

    const isQuarantined = quarantineKeys.has(`quarantine/${doc.objectKey}`);
    if (isQuarantined) {
      report.alreadyClassified.push(`${doc.id} — ${doc.filename} (in quarantine)`);
      continue;
    }

    const isSystemGenerated = !doc.uploadedById || doc.objectKey.includes("/pod/");

    if (isSystemGenerated) {
      report.systemGenerated.push(`${doc.id} — ${doc.filename}`);
      if (!dryRun) {
        await db.fileAttachment.create({
          data: {
            tenantId: doc.tenantId,
            tripId: doc.tripId,
            filename: doc.filename,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            status: "AVAILABLE",
            bucket: doc.bucket,
            quarantineKey: `system/${doc.objectKey}`,
            objectKey: doc.objectKey,
            promotedAt: doc.createdAt,
          },
        });
      }
    } else {
      report.userUploaded.push(`${doc.id} — ${doc.filename} (uploaded by ${doc.uploadedById})`);
      if (!dryRun) {
        await db.fileAttachment.create({
          data: {
            tenantId: doc.tenantId,
            tripId: doc.tripId,
            uploadedById: doc.uploadedById,
            filename: doc.filename,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            status: "AVAILABLE",
            bucket: doc.bucket,
            quarantineKey: `legacy/${doc.objectKey}`,
            objectKey: doc.objectKey,
            promotedAt: doc.createdAt,
            scanDetail: "Legacy document — classified post-migration without AV scan",
          },
        });
      }
    }
  }

  console.log("=== Report ===\n");
  console.log(`System-generated (trusted): ${report.systemGenerated.length}`);
  report.systemGenerated.forEach((s) => console.log(`  ${s}`));

  console.log(`\nUser-uploaded (legacy): ${report.userUploaded.length}`);
  report.userUploaded.forEach((s) => console.log(`  ${s}`));

  console.log(`\nAlready classified: ${report.alreadyClassified.length}`);
  report.alreadyClassified.forEach((s) => console.log(`  ${s}`));

  if (report.errors.length) {
    console.error(`\nErrors: ${report.errors.length}`);
    report.errors.forEach((s) => console.error(`  ${s}`));
  }

  console.log(`\nTotal documents: ${allDocs.length}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (no changes)" : "APPLIED"}\n`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
