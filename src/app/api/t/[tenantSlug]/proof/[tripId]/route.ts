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
  { params }: { params: Promise<{ tenantSlug: string; tripId: string }> },
) {
  const { tenantSlug, tripId } = await params;
  const { user, tenant, customerAccount } = await requireCustomerMembership(tenantSlug);

  const rate = await enforceRateLimit({
    scope: "proof.download",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: tripId, tenantId: tenant.id, customerAccountId: customerAccount.id },
    include: { proof: true },
  });

  if (!trip || !trip.proofReady || !trip.proof) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const document = await db.document.findFirst({
    where: {
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
      tripId: trip.id,
      proofId: trip.proof.id,
      mimeType: "application/pdf",
      visibility: "CUSTOMER_VISIBLE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!document) return new NextResponse("No encontrado", { status: 404 });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: "CUSTOMER",
    action: "proof.download",
    entity: "Document",
    entityId: document.id,
    after: { tripId: trip.id, reference: trip.reference },
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
