import { NextResponse } from "next/server";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getSignedReadUrl } from "@/lib/server/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; tripId: string }> },
) {
  const { tenantSlug, tripId } = await params;
  const { tenant, customerAccount } = await requireCustomerMembership(tenantSlug);
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
  return NextResponse.redirect(await getSignedReadUrl(document.objectKey));
}
