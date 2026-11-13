import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom, verifyMutationOrigin } from "@/lib/server/http-security";
import { processUploadThroughPipeline } from "@/lib/server/file-pipeline";
import { EVIDENCE_DOCUMENT_VISIBILITY } from "@/lib/domain/proof-evidence";
import {
  MAX_UPLOAD_FILE_BYTES,
  UploadRejectedError,
  getStorageBucket,
  validateUploadedFile,
} from "@/lib/server/storage";

/** Margen del multipart (campos idempotencyKey/tripId/contentHash y delimitadores) sobre el archivo. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_FILE_BYTES + MULTIPART_OVERHEAD_BYTES;

function errorJson(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * POST /api/t/[tenantSlug]/driver/attachment
 *
 * Multipart upload for driver evidence photos with idempotency via AttachmentReceipt.
 * Expects FormData with: idempotencyKey, tripId, contentHash, file.
 *
 * Returns the receipt status and fileAttachmentId if already processed.
 */
export async function POST(request: Request, context: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await context.params;

  const origin = verifyMutationOrigin(request);
  if (!origin.ok) return errorJson("ORIGIN_MISMATCH", "Origin no permitido", 403);

  // Rechaza antes de autenticar y de leer el cuerpo. En Vercel el limite de la plataforma
  // (~4,5 MB) responde 413 por su cuenta; esto cubre el resto de despliegues.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return errorJson("FILE_TOO_LARGE", "Archivo excede 3 MB", 413);
  }

  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["DRIVER", "TENANT_OWNER", "DISPATCHER"]);

  const rate = await enforceRateLimit({
    scope: "attachment.upload",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Demasiadas solicitudes" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  const driver = await db.driver.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true },
  });

  if (membership.role === "DRIVER" && !driver) {
    return errorJson("ACCESS_DENIED", "No es un conductor asignado", 403);
  }
  if (!driver) {
    return errorJson("ACCESS_DENIED", "Conductor no encontrado", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson("INVALID_PAYLOAD", "Se esperaba FormData", 400);
  }

  const idempotencyKey = formData.get("idempotencyKey");
  const tripId = formData.get("tripId");
  const contentHash = formData.get("contentHash");
  const file = formData.get("file");

  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    return errorJson("INVALID_PAYLOAD", "Falta idempotencyKey", 400);
  }
  if (typeof tripId !== "string" || !tripId) {
    return errorJson("INVALID_PAYLOAD", "Falta tripId", 400);
  }
  if (!(file instanceof File)) {
    return errorJson("INVALID_PAYLOAD", "Falta archivo", 400);
  }
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return errorJson("FILE_TOO_LARGE", "Archivo excede 3 MB", 413);
  }

  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: tenant.id, driverId: driver.id },
    select: { id: true, reference: true },
  });
  if (!trip) {
    return errorJson("TRIP_NOT_FOUND", "Viaje no encontrado o no asignado", 404);
  }

  const existingReceipt = await db.attachmentReceipt.findUnique({
    where: {
      tenantId_userId_idempotencyKey: {
        tenantId: tenant.id,
        userId: user.id,
        idempotencyKey,
      },
    },
  });

  if (existingReceipt) {
    if (existingReceipt.status === "COMPLETE" && typeof contentHash === "string" && existingReceipt.fileAttachmentId) {
      const attachment = await db.fileAttachment.findUnique({
        where: { id: existingReceipt.fileAttachmentId },
        select: { id: true, status: true },
      });
      return NextResponse.json({
        receipt: "DUPLICATE",
        fileAttachmentId: existingReceipt.fileAttachmentId,
        fileStatus: attachment?.status ?? "UNKNOWN",
      });
    }
    if (existingReceipt.status === "PROCESSING") {
      return NextResponse.json({ receipt: "PROCESSING", fileAttachmentId: existingReceipt.fileAttachmentId });
    }
    return NextResponse.json({
      receipt: "DUPLICATE",
      fileAttachmentId: existingReceipt.fileAttachmentId,
      fileStatus: existingReceipt.status,
    });
  }

  const receipt = await db.attachmentReceipt.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      idempotencyKey,
      status: "PROCESSING",
    },
  });

  try {
    // Mismo control que la evidencia por formulario: MIME permitido, extension coherente y
    // magic bytes reales. Nunca se confia en file.type / file.name del cliente (ni se usa el
    // nombre crudo en la clave del objeto).
    const { buffer, mimeType, filename } = await validateUploadedFile(file);
    const targetKey = `tenants/${tenantSlug}/trips/${trip.reference}/evidence/${Date.now()}-${filename}`;

    const result = await processUploadThroughPipeline({
      tenantId: tenant.id,
      tripId: trip.id,
      uploadedById: user.id,
      filename,
      mimeType,
      buffer,
      targetKey,
    });

    const finalStatus = result.verdict === "CLEAN" ? "COMPLETE" : result.verdict === "INFECTED" ? "REJECTED" : "PENDING_SCAN";

    await db.attachmentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: finalStatus,
        fileAttachmentId: result.fileAttachmentId,
      },
    });

    if (result.objectKey) {
      await db.document.create({
        data: {
          tenantId: tenant.id,
          customerAccountId: (await db.trip.findUniqueOrThrow({ where: { id: trip.id }, select: { customerAccountId: true } })).customerAccountId,
          tripId: trip.id,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          bucket: getStorageBucket(),
          objectKey: result.objectKey,
          // La evidencia nace INTERNAL: operaciones la revisa y solo submitProofAction /
          // approveProofAction la liga a la prueba y la publican al cliente.
          visibility: EVIDENCE_DOCUMENT_VISIBILITY,
          uploadedById: user.id,
        },
      });
    }

    logger.info("attachment upload complete", {
      receiptId: receipt.id,
      fileAttachmentId: result.fileAttachmentId,
      verdict: result.verdict,
      tenantId: tenant.id,
      userId: user.id,
    });

    return NextResponse.json({
      receipt: finalStatus === "COMPLETE" ? "ACCEPTED" : finalStatus === "REJECTED" ? "REJECTED" : "PENDING",
      fileAttachmentId: result.fileAttachmentId,
      fileStatus: result.verdict === "CLEAN" ? "AVAILABLE" : result.verdict,
    });
  } catch (error) {
    await db.attachmentReceipt.update({
      where: { id: receipt.id },
      data: { status: "FAILED" },
    });

    if (error instanceof UploadRejectedError) {
      return errorJson("UPLOAD_REJECTED", error.message, 400);
    }

    logger.error("attachment upload failed", {
      receiptId: receipt.id,
      error: error instanceof Error ? error.message : "unknown",
    });

    return errorJson("UPLOAD_FAILED", "Error al procesar el archivo", 500);
  }
}

/**
 * GET /api/t/[tenantSlug]/driver/attachment?idempotencyKey=...
 *
 * Check the status of a previously initiated upload.
 */
export async function GET(request: Request, context: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await context.params;
  const { user, tenant } = await requireTenantRole(tenantSlug, ["DRIVER", "TENANT_OWNER", "DISPATCHER"]);

  const url = new URL(request.url);
  const idempotencyKey = url.searchParams.get("idempotencyKey");
  if (!idempotencyKey) {
    return errorJson("INVALID_PAYLOAD", "Falta idempotencyKey", 400);
  }

  const db = getDb();
  const receipt = await db.attachmentReceipt.findUnique({
    where: {
      tenantId_userId_idempotencyKey: {
        tenantId: tenant.id,
        userId: user.id,
        idempotencyKey,
      },
    },
  });

  if (!receipt) {
    return NextResponse.json({ receipt: "NOT_FOUND" }, { status: 404 });
  }

  let fileStatus: string | null = null;
  if (receipt.fileAttachmentId) {
    const attachment = await db.fileAttachment.findUnique({
      where: { id: receipt.fileAttachmentId },
      select: { status: true },
    });
    fileStatus = attachment?.status ?? null;
  }

  return NextResponse.json({
    receipt: receipt.status,
    fileAttachmentId: receipt.fileAttachmentId,
    fileStatus,
  });
}

export const dynamic = "force-dynamic";
