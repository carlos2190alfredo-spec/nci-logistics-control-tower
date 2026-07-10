import { NextResponse } from "next/server";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getSignedReadUrl } from "@/lib/server/storage";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom } from "@/lib/server/http-security";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { audit } from "@/lib/server/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; documentId: string }> },
) {
  const { tenantSlug, documentId } = await params;
  const { user, tenant, customerAccount } = await requireCustomerMembership(tenantSlug);

  const rate = await enforceRateLimit({
    scope: "document.download",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  const document = await db.document.findFirst({
    where: {
      id: documentId,
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
      visibility: "CUSTOMER_VISIBLE",
    },
  });

  if (!document) return new NextResponse("No encontrado", { status: 404 });

  const attachment = await db.fileAttachment.findFirst({
    where: {
      tenantId: tenant.id,
      objectKey: document.objectKey,
    },
  });

  if (attachment && attachment.status !== "AVAILABLE") {
    return new NextResponse("Archivo en proceso de verificacion", { status: 403 });
  }

  if (!attachment && document.uploadedById) {
    return new NextResponse("Archivo pendiente de clasificacion", { status: 403 });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: "CUSTOMER",
    action: "document.download",
    entity: "Document",
    entityId: document.id,
    after: { filename: document.filename },
  });

  const signed = await getSignedReadUrl(document.objectKey, {
    expiresIn: 60,
    contentDisposition: `attachment; filename="${document.filename}"`,
  });
  return NextResponse.redirect(signed, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
