import { randomUUID } from "node:crypto";
import type { FileStatus, ScanVerdict as PrismaScanVerdict } from "@/generated/prisma";
import { getDb } from "@/lib/server/db";
import { getAntivirusProvider, type ScanResult } from "@/lib/server/antivirus";
import { getStorageBucket, uploadBuffer, getStorageClient } from "@/lib/server/storage";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "@/lib/server/logger";
import { stripExif } from "@/lib/server/exif-strip";

const QUARANTINE_PREFIX = "quarantine/";

export class FilePipelineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function quarantineUpload(input: {
  tenantId: string;
  tripId?: string;
  proofId?: string;
  uploadedById?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  targetKey: string;
}): Promise<{ fileAttachmentId: string }> {
  const id = randomUUID();
  const quarantineKey = `${QUARANTINE_PREFIX}${input.targetKey}`;

  const cleanBuffer = input.mimeType === "image/jpeg" ? stripExif(input.buffer) : input.buffer;

  await uploadBuffer({
    objectKey: quarantineKey,
    body: cleanBuffer,
    contentType: input.mimeType,
    contentDisposition: `attachment; filename="${input.filename}"`,
  });

  const db = getDb();
  const attachment = await db.fileAttachment.create({
    data: {
      id,
      tenantId: input.tenantId,
      tripId: input.tripId,
      proofId: input.proofId,
      uploadedById: input.uploadedById,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: cleanBuffer.length,
      status: "QUARANTINE",
      bucket: getStorageBucket(),
      quarantineKey,
    },
  });

  logger.info("file quarantined", {
    fileAttachmentId: attachment.id,
    tenantId: input.tenantId,
    filename: input.filename,
    sizeBytes: input.buffer.length,
  });

  return { fileAttachmentId: attachment.id };
}

export async function scanFile(fileAttachmentId: string): Promise<ScanResult> {
  const db = getDb();
  const attachment = await db.fileAttachment.findUniqueOrThrow({
    where: { id: fileAttachmentId },
  });

  if (attachment.status !== "QUARANTINE" && attachment.status !== "PENDING_SCAN") {
    throw new FilePipelineError("INVALID_STATE", `Cannot scan file in status ${attachment.status}`);
  }

  // El proveedor se resuelve ANTES de marcar SCANNING: si la configuracion es invalida
  // (p. ej. ANTIVIRUS_URL sin ANTIVIRUS_TOKEN) el archivo queda como estaba y no atascado.
  const av = getAntivirusProvider();

  await db.fileAttachment.update({
    where: { id: fileAttachmentId },
    data: { status: "SCANNING" },
  });

  const isAvailable = await av.ping();
  if (!isAvailable) {
    await db.fileAttachment.update({
      where: { id: fileAttachmentId },
      data: { status: "PENDING_SCAN" },
    });
    throw new FilePipelineError("AV_UNAVAILABLE", "ClamAV is not available — fail closed");
  }

  // Cualquier fallo tras marcar SCANNING (lectura de S3, gateway, DB) deja el archivo en
  // PENDING_SCAN para que el cron de mantenimiento lo reintente; si no, quedaria en SCANNING
  // para siempre porque `scanFile` solo acepta QUARANTINE o PENDING_SCAN.
  let result: ScanResult;
  let durationMs: number;
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = getStorageClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: attachment.bucket,
        Key: attachment.quarantineKey,
      }),
    );
    const bodyBytes = await response.Body?.transformToByteArray();
    if (!bodyBytes) {
      throw new FilePipelineError("STORAGE_ERROR", "Failed to read quarantined file");
    }
    const buffer = Buffer.from(bodyBytes);

    const startMs = Date.now();
    result = await av.scan(buffer);
    durationMs = Date.now() - startMs;

    const verdictMap: Record<string, PrismaScanVerdict> = {
      CLEAN: "CLEAN",
      INFECTED: "INFECTED",
      ERROR: "ERROR",
    };

    const prismaVerdict = verdictMap[result.verdict] ?? "ERROR";

    await db.$transaction(async (tx) => {
      await tx.fileScanEvent.create({
        data: {
          fileAttachmentId,
          verdict: prismaVerdict,
          detail: result.detail,
          durationMs,
        },
      });

      const newStatus: FileStatus =
        result.verdict === "CLEAN" ? "CLEAN" : result.verdict === "INFECTED" ? "INFECTED" : "PENDING_SCAN";

      await tx.fileAttachment.update({
        where: { id: fileAttachmentId },
        data: {
          status: newStatus,
          scanVerdict: prismaVerdict,
          scanDetail: result.detail,
          scannedAt: new Date(),
        },
      });
    });
  } catch (error) {
    await db.fileAttachment
      .updateMany({ where: { id: fileAttachmentId, status: "SCANNING" }, data: { status: "PENDING_SCAN" } })
      .catch(() => undefined);
    throw error;
  }

  logger.info("file scan complete", {
    fileAttachmentId,
    verdict: result.verdict,
    durationMs,
  });

  return result;
}

export async function promoteFile(fileAttachmentId: string): Promise<{ objectKey: string }> {
  const db = getDb();
  const attachment = await db.fileAttachment.findUniqueOrThrow({
    where: { id: fileAttachmentId },
  });

  if (attachment.status !== "CLEAN") {
    throw new FilePipelineError("INVALID_STATE", `Cannot promote file in status ${attachment.status}`);
  }

  const objectKey = attachment.quarantineKey.replace(QUARANTINE_PREFIX, "");
  const client = getStorageClient();
  const bucket = getStorageBucket();

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${attachment.quarantineKey}`,
      Key: objectKey,
    }),
  );

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: attachment.quarantineKey,
    }),
  );

  await db.fileAttachment.update({
    where: { id: fileAttachmentId },
    data: {
      status: "AVAILABLE",
      objectKey,
      promotedAt: new Date(),
    },
  });

  logger.info("file promoted", { fileAttachmentId, objectKey });
  return { objectKey };
}

export async function rejectFile(fileAttachmentId: string): Promise<void> {
  const db = getDb();
  const attachment = await db.fileAttachment.findUniqueOrThrow({
    where: { id: fileAttachmentId },
  });

  if (attachment.status !== "INFECTED" && attachment.status !== "CLEAN") {
    throw new FilePipelineError("INVALID_STATE", `Cannot reject file in status ${attachment.status}`);
  }

  const client = getStorageClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getStorageBucket(),
      Key: attachment.quarantineKey,
    }),
  );

  await db.fileAttachment.update({
    where: { id: fileAttachmentId },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
    },
  });

  logger.info("file rejected", { fileAttachmentId });
}

export async function processUploadThroughPipeline(input: {
  tenantId: string;
  tripId?: string;
  proofId?: string;
  uploadedById?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  targetKey: string;
}): Promise<{ fileAttachmentId: string; objectKey: string | null; verdict: string }> {
  const { fileAttachmentId } = await quarantineUpload(input);

  let scanResult: ScanResult;
  try {
    scanResult = await scanFile(fileAttachmentId);
  } catch (error) {
    if (error instanceof FilePipelineError && error.code === "AV_UNAVAILABLE") {
      logger.warn("AV unavailable, file stays in quarantine", { fileAttachmentId });
      return { fileAttachmentId, objectKey: null, verdict: "PENDING" };
    }
    throw error;
  }

  if (scanResult.verdict === "CLEAN") {
    const { objectKey } = await promoteFile(fileAttachmentId);
    return { fileAttachmentId, objectKey, verdict: "CLEAN" };
  }

  if (scanResult.verdict === "INFECTED") {
    await rejectFile(fileAttachmentId);
    return { fileAttachmentId, objectKey: null, verdict: "INFECTED" };
  }

  return { fileAttachmentId, objectKey: null, verdict: "ERROR" };
}
