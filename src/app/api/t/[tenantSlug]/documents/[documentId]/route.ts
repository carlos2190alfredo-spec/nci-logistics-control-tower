import { NextResponse } from "next/server";
import { requireCustomerMembership } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getSignedReadUrl } from "@/lib/server/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; documentId: string }> },
) {
  const { tenantSlug, documentId } = await params;
  const { tenant, customerAccount } = await requireCustomerMembership(tenantSlug);
  const document = await getDb().document.findFirst({
    where: {
      id: documentId,
      tenantId: tenant.id,
      customerAccountId: customerAccount.id,
      visibility: "CUSTOMER_VISIBLE",
    },
  });

  if (!document) return new NextResponse("No encontrado", { status: 404 });
  return NextResponse.redirect(await getSignedReadUrl(document.objectKey));
}
