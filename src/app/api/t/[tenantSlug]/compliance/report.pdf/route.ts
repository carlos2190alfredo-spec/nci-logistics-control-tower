import { NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFrom } from "@/lib/server/http-security";
import { ErrorCodes, errorMessages } from "@/lib/server/errors";
import { audit } from "@/lib/server/audit";
import { getComplianceOverview } from "@/lib/server/compliance-data";
import { generateCompliancePdf } from "@/lib/server/compliance-pdf";

/**
 * PDF ejecutivo del cumplimiento del tenant, con branding, semáforo global y
 * documentos. Determinista: refleja la evaluación ya calculada. La IA no
 * participa. Solo roles con permiso de cumplimiento y con rate-limit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER",
    "TENANT_ADMIN",
    "OPERATIONS_MANAGER",
    "SAFETY_MANAGER",
  ]);

  const rate = await enforceRateLimit({
    scope: "compliance.pdf",
    key: `${tenant.id}:${user.id}:${clientIpFrom(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: ErrorCodes.RATE_LIMITED, message: errorMessages.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const db = getDb();
  const [overview, tenantWithBranding] = await Promise.all([
    getComplianceOverview(tenant.id),
    db.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { branding: true } }),
  ]);

  const pdf = await generateCompliancePdf({
    tenant: tenantWithBranding,
    light: overview.light,
    counts: overview.counts,
    blockingCount: overview.blockingCount,
    documents: overview.documents,
    generatedAt: new Date(),
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "compliance.report.pdf",
    entity: "Tenant",
    entityId: tenant.id,
    after: { light: overview.light, blocking: overview.blockingCount, documents: overview.documents.length },
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tenant.slug}-cumplimiento.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
